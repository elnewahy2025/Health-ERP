import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getEnv } from '@healthcare/shared/config';
import { ConflictError } from '@healthcare/shared/errors';
import { db } from '../core/database.js';

const BACKUP_FORMAT_VERSION = 1;
const WORKER_INTERVAL_MS = 60_000;
const STALE_RUNNING_MINUTES = 60;
const EXCLUDED_TABLES = new Set(['backup_executions', 'backup_restore_verifications']);
const BACKUP_ROOT = path.resolve(process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), 'backups'));

export interface LogicalBackupSnapshot {
  formatVersion: number;
  tenantId: string;
  createdAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
  rowCount: number;
}

interface ForeignKeyDefinition {
  tableName: string;
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
}

interface BackupArtifactReference {
  storageLocation: string;
  key: string;
}

interface BackupStorageObject {
  reference: BackupArtifactReference;
  sizeBytes: number;
  checksum: string;
}

let workerInterval: ReturnType<typeof setInterval> | null = null;
let workerRunning = false;

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]));
  }
  return value;
}

function encryptSnapshot(snapshot: LogicalBackupSnapshot): Buffer {
  const env = getEnv();
  const configuredKey = process.env.BACKUP_ENCRYPTION_KEY || env.ENCRYPTION_KEY;
  if (!configuredKey || configuredKey.length < 32) {
    throw new ConflictError('Backup encryption is not configured with a sufficiently strong key');
  }
  const key = crypto.createHash('sha256').update(configuredKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('HEALTH_ERP_BACKUP\0', 'utf8'), iv, authTag, ciphertext]);
}

function decryptSnapshot(buffer: Buffer): LogicalBackupSnapshot {
  const env = getEnv();
  const configuredKey = process.env.BACKUP_ENCRYPTION_KEY || env.ENCRYPTION_KEY;
  if (!configuredKey || configuredKey.length < 32) {
    throw new ConflictError('Backup encryption is not configured with a sufficiently strong key');
  }
  const header = Buffer.from('HEALTH_ERP_BACKUP\0', 'utf8');
  if (buffer.subarray(0, header.length).compare(header) !== 0) throw new ConflictError('Backup artifact format is invalid');
  const ivStart = header.length;
  const iv = buffer.subarray(ivStart, ivStart + 12);
  const authTag = buffer.subarray(ivStart + 12, ivStart + 28);
  const ciphertext = buffer.subarray(ivStart + 28);
  const key = crypto.createHash('sha256').update(configuredKey).digest();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const snapshot = JSON.parse(plaintext.toString('utf8')) as LogicalBackupSnapshot;
    if (snapshot.formatVersion !== BACKUP_FORMAT_VERSION || !snapshot.tenantId || !snapshot.tables) {
      throw new Error('invalid logical snapshot metadata');
    }
    return snapshot;
  } catch {
    throw new ConflictError('Backup artifact authentication failed');
  }
}

function parseStorageLocation(location: string, tenantId: string, executionId: string): BackupArtifactReference {
  const trimmed = location.trim();
  if (trimmed.startsWith('minio://')) {
    const withoutScheme = trimmed.slice('minio://'.length).replace(/^\/+/, '');
    const [bucket, ...prefixParts] = withoutScheme.split('/').filter(Boolean);
    if (!bucket) throw new ConflictError('Backup MinIO storage location must include a bucket');
    const prefix = prefixParts.join('/');
    return { storageLocation: trimmed, key: [prefix, tenantId, `${executionId}.backup.enc`].filter(Boolean).join('/') };
  }
  if (trimmed.startsWith('local://') || trimmed.startsWith('file://')) {
    const prefix = trimmed.replace(/^(local|file):\/\//, '').replace(/^\/+|\/+$/g, '');
    return { storageLocation: trimmed, key: path.join(prefix, tenantId, `${executionId}.backup.enc`) };
  }
  throw new ConflictError('Backup storage location must use minio:// or local://');
}

function minioClient(): S3Client {
  const env = getEnv();
  const endpoint = `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY },
    forcePathStyle: true,
  });
}

function minioBucket(reference: BackupArtifactReference): string {
  const withoutScheme = reference.storageLocation.slice('minio://'.length).replace(/^\/+/, '');
  const [bucket] = withoutScheme.split('/').filter(Boolean);
  if (!bucket) throw new ConflictError('Backup MinIO bucket is missing');
  return bucket;
}

async function putArtifact(reference: BackupArtifactReference, buffer: Buffer): Promise<void> {
  if (reference.storageLocation.startsWith('minio://')) {
    await minioClient().send(new PutObjectCommand({
      Bucket: minioBucket(reference), Key: reference.key, Body: buffer,
      ContentType: 'application/vnd.health-erp.backup', ServerSideEncryption: 'AES256',
    }));
    return;
  }
  const target = path.resolve(BACKUP_ROOT, reference.key);
  if (!target.startsWith(`${BACKUP_ROOT}${path.sep}`)) throw new ConflictError('Backup path escapes the configured local storage root');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { flag: 'wx' });
}

async function getArtifact(reference: BackupArtifactReference): Promise<Buffer> {
  if (reference.storageLocation.startsWith('minio://')) {
    const result = await minioClient().send(new GetObjectCommand({ Bucket: minioBucket(reference), Key: reference.key }));
    const body = result.Body;
    if (!body) throw new ConflictError('Backup artifact body is empty');
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  const target = path.resolve(BACKUP_ROOT, reference.key);
  if (!target.startsWith(`${BACKUP_ROOT}${path.sep}`)) throw new ConflictError('Backup path escapes the configured local storage root');
  return fs.readFile(target);
}

async function deleteArtifact(reference: BackupArtifactReference): Promise<void> {
  if (reference.storageLocation.startsWith('minio://')) {
    await minioClient().send(new DeleteObjectCommand({ Bucket: minioBucket(reference), Key: reference.key }));
    return;
  }
  const target = path.resolve(BACKUP_ROOT, reference.key);
  if (!target.startsWith(`${BACKUP_ROOT}${path.sep}`)) throw new ConflictError('Backup path escapes the configured local storage root');
  await fs.rm(target, { force: true });
}

async function assertArtifactExists(reference: BackupArtifactReference): Promise<void> {
  if (reference.storageLocation.startsWith('minio://')) {
    await minioClient().send(new HeadObjectCommand({ Bucket: minioBucket(reference), Key: reference.key }));
    return;
  }
  await fs.access(path.resolve(BACKUP_ROOT, reference.key));
}

async function getPublicTables(): Promise<string[]> {
  const result = await db.raw<{ rows: Array<{ table_name: string }> }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name).filter((tableName) => !EXCLUDED_TABLES.has(tableName));
}

async function getTenantTables(): Promise<string[]> {
  const result = await db.raw<{ rows: Array<{ table_name: string }> }>(
    `SELECT DISTINCT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
      ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name).filter((tableName) => !EXCLUDED_TABLES.has(tableName));
}

async function getForeignKeysFor(database: Knex): Promise<ForeignKeyDefinition[]> {
  const result = await database.raw<{ rows: ForeignKeyDefinition[] }>(
    `SELECT tc.table_name AS "tableName", kcu.column_name AS "columnName",
            ccu.table_name AS "foreignTableName", ccu.column_name AS "foreignColumnName"
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  return result.rows.filter((row) => !EXCLUDED_TABLES.has(row.tableName) && !EXCLUDED_TABLES.has(row.foreignTableName));
}

async function getForeignKeys(): Promise<ForeignKeyDefinition[]> {
  return getForeignKeysFor(db);
}

async function collectTenantSnapshot(tenantId: string, excludedTables: string[] = []): Promise<LogicalBackupSnapshot> {
  const excluded = new Set([...EXCLUDED_TABLES, ...excludedTables]);
  const tenantTables = (await getTenantTables()).filter((tableName) => !excluded.has(tableName));
  const publicTables = new Set(await getPublicTables());
  const foreignKeys = await getForeignKeys();
  const rowsByTable: Record<string, Array<Record<string, unknown>>> = {};
  const seen = new Map<string, Set<string>>();

  for (const tableName of tenantTables) {
    const rows = await db(tableName).where({ tenant_id: tenantId });
    rowsByTable[tableName] = rows.map((row) => toJsonValue(row) as Record<string, unknown>);
    seen.set(tableName, new Set(rows.map((row) => String(row.id ?? JSON.stringify(row)))));
  }

  const queue: Array<{ tableName: string; row: Record<string, unknown> }> = Object.entries(rowsByTable)
    .flatMap(([tableName, rows]) => rows.map((row) => ({ tableName, row })));
  const foreignKeysByTable = new Map<string, ForeignKeyDefinition[]>();
  for (const foreignKey of foreignKeys) {
    if (!publicTables.has(foreignKey.foreignTableName)) continue;
    const list = foreignKeysByTable.get(foreignKey.tableName) || [];
    list.push(foreignKey);
    foreignKeysByTable.set(foreignKey.tableName, list);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const foreignKey of foreignKeysByTable.get(current.tableName) || []) {
      const value = current.row[foreignKey.columnName];
      if (value === null || value === undefined) continue;
      const referenced = await db(foreignKey.foreignTableName).where(foreignKey.foreignColumnName, value);
      for (const row of referenced) {
        if ('tenant_id' in row && row.tenant_id !== tenantId) {
          throw new ConflictError(`Tenant backup encountered a cross-tenant reference in ${current.tableName}`);
        }
        const key = String(row.id ?? JSON.stringify(row));
        const tableSeen = seen.get(foreignKey.foreignTableName) || new Set<string>();
        if (tableSeen.has(key)) continue;
        tableSeen.add(key);
        seen.set(foreignKey.foreignTableName, tableSeen);
        const normalized = toJsonValue(row) as Record<string, unknown>;
        rowsByTable[foreignKey.foreignTableName] ||= [];
        rowsByTable[foreignKey.foreignTableName].push(normalized);
        queue.push({ tableName: foreignKey.foreignTableName, row: normalized });
      }
    }
  }

  const rowCount = Object.values(rowsByTable).reduce((total, rows) => total + rows.length, 0);
  return { formatVersion: BACKUP_FORMAT_VERSION, tenantId, createdAt: new Date().toISOString(), tables: rowsByTable, rowCount };
}

async function claimNextBackup(): Promise<Record<string, unknown> | null> {
  return db.transaction(async (trx) => {
    const execution = await trx('backup_executions')
      .where('status', 'pending')
      .orderBy('created_at', 'asc')
      .forUpdate()
      .skipLocked()
      .first();
    if (!execution) return null;
    await trx('backup_executions').where({ id: execution.id, status: 'pending' }).update({ status: 'running', started_at: new Date(), error: null });
    return { ...execution, status: 'running' };
  });
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function artifactReference(execution: Record<string, unknown>): BackupArtifactReference {
  return parseStorageLocation(String(execution.storage_location || 'local://backups'), String(execution.tenant_id), String(execution.id));
}

export async function processBackupExecution(execution: Record<string, unknown>): Promise<void> {
  const reference = artifactReference(execution);
  let artifactWritten = false;
  try {
    const snapshot = await collectTenantSnapshot(String(execution.tenant_id), parseStringArray(execution.exclude_tables));
    const encrypted = encryptSnapshot(snapshot);
    const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
    await putArtifact(reference, encrypted);
    artifactWritten = true;
    await db('backup_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({
      status: 'completed', size_bytes: encrypted.length, file_path: `${reference.storageLocation}${reference.storageLocation.endsWith('/') ? '' : '/'}${reference.key}`,
      checksum, row_count: snapshot.rowCount, retention_expires_at: new Date(Date.now() + (Number(execution.retention_days) || 30) * 86_400_000), completed_at: new Date(), error: null,
    });
    if (execution.config_id) await db('backup_configs').where({ id: execution.config_id, tenant_id: execution.tenant_id }).update({ last_backup_at: new Date() });
  } catch (error) {
    if (artifactWritten) await deleteArtifact(reference).catch(() => {});
    await db('backup_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'failed', error: error instanceof Error ? error.message : 'Backup failed', completed_at: new Date() });
  }
}

async function recoverStaleBackups(): Promise<void> {
  await db('backup_executions').where('status', 'running').where('started_at', '<', new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000)).update({ status: 'pending', error: 'Recovered after worker interruption', started_at: null });
}

function cronFieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;
  return field.split(',').some((part) => {
    if (part.startsWith('*/')) {
      const step = Number(part.slice(2));
      return Number.isInteger(step) && step > 0 && (value - min) % step === 0;
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return value >= start && value <= end;
    }
    return Number(part) === value;
  });
}

function scheduleIsDue(schedule: string, lastBackupAt: Date | null | undefined, now = new Date()): boolean {
  if (lastBackupAt && now.getTime() - new Date(lastBackupAt).getTime() < 60_000) return false;
  if (schedule === '@hourly') return now.getMinutes() === 0;
  if (schedule === '@daily') return now.getHours() === 0 && now.getMinutes() === 0;
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return cronFieldMatches(fields[0], now.getMinutes(), 0, 59)
    && cronFieldMatches(fields[1], now.getHours(), 0, 23)
    && cronFieldMatches(fields[2], now.getDate(), 1, 31)
    && cronFieldMatches(fields[3], now.getMonth() + 1, 1, 12)
    && cronFieldMatches(fields[4], now.getDay(), 0, 6);
}

async function enqueueScheduledBackups(now = new Date()): Promise<void> {
  const configs = await db('backup_configs').where({ is_active: true });
  for (const config of configs) {
    if (!scheduleIsDue(String(config.schedule), config.last_backup_at, now)) continue;
    await db.transaction(async (trx) => {
      const locked = await trx('backup_configs').where({ id: config.id, tenant_id: config.tenant_id, is_active: true }).forUpdate().first();
      if (!locked || !scheduleIsDue(String(locked.schedule), locked.last_backup_at, now)) return;
      const existing = await trx('backup_executions').where({ config_id: locked.id, status: 'pending' }).orWhere({ config_id: locked.id, status: 'running' }).first();
      if (existing) return;
      await trx('backup_executions').insert({
        tenant_id: locked.tenant_id, config_id: locked.id, type: locked.type || 'logical', status: 'pending', trigger: 'scheduled',
        retention_days: locked.retention_days, storage_location: locked.storage_location, exclude_tables: JSON.stringify(parseStringArray(locked.exclude_tables)),
      });
    });
  }
}

export async function processPendingBackupsOnce(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await recoverStaleBackups();
    await enqueueScheduledBackups();
    const execution = await claimNextBackup();
    if (execution) await processBackupExecution(execution);
    await applyBackupRetention();
  } finally {
    workerRunning = false;
  }
}

export function startBackupWorker(): void {
  if (workerInterval) return;
  processPendingBackupsOnce().catch((error) => console.error('Backup worker error:', error));
  workerInterval = setInterval(() => processPendingBackupsOnce().catch((error) => console.error('Backup worker error:', error)), WORKER_INTERVAL_MS);
  workerInterval.unref?.();
  console.log('✓ Durable backup worker started (checks every 60 seconds)');
}

export function stopBackupWorker(): void {
  if (workerInterval) clearInterval(workerInterval);
  workerInterval = null;
}

export async function verifyBackupExecution(tenantId: string, executionId: string): Promise<Record<string, unknown>> {
  const execution = await db('backup_executions').where({ id: executionId, tenant_id: tenantId, status: 'completed' }).first();
  if (!execution || !execution.file_path) throw new ConflictError('Only a completed backup with an artifact can be verified');
  const targetDatabase = process.env.BACKUP_VERIFY_DB_NAME;
  if (!targetDatabase || targetDatabase === getEnv().DB_NAME) throw new ConflictError('An isolated BACKUP_VERIFY_DB_NAME is required for restore verification');

  const [verification] = await db('backup_restore_verifications').insert({ tenant_id: tenantId, backup_execution_id: executionId, status: 'running', target_reference: targetDatabase }).returning('*');
  const target = knex({
    client: 'pg',
    connection: { host: getEnv().DB_HOST, port: getEnv().DB_PORT, database: targetDatabase, user: process.env.BACKUP_VERIFY_DB_USER || getEnv().DB_USER, password: process.env.BACKUP_VERIFY_DB_PASSWORD || getEnv().DB_PASSWORD, ...(getEnv().DB_SSL ? { ssl: { rejectUnauthorized: false } } : {}) },
    pool: { min: 1, max: 2 },
  });
  try {
    const reference = artifactReference(execution);
    const encrypted = await getArtifact(reference);
    const actualChecksum = crypto.createHash('sha256').update(encrypted).digest('hex');
    if (actualChecksum !== String(execution.checksum)) throw new ConflictError('Backup checksum verification failed');
    const snapshot = decryptSnapshot(encrypted);
    const restoredRows = await restoreSnapshotIntoDatabase(target, snapshot);
    await db('backup_restore_verifications').where({ id: verification.id, tenant_id: tenantId }).update({ status: 'completed', row_count: restoredRows, checksum: actualChecksum, completed_at: new Date(), error: null });
    await db('backup_executions').where({ id: executionId, tenant_id: tenantId }).update({ verified_at: new Date(), verification_status: 'passed', verification_error: null });
    return { id: verification.id, status: 'completed', rowCount: restoredRows, checksum: actualChecksum, targetDatabase };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Restore verification failed';
    await db('backup_restore_verifications').where({ id: verification.id, tenant_id: tenantId }).update({ status: 'failed', error: message, completed_at: new Date() });
    await db('backup_executions').where({ id: executionId, tenant_id: tenantId }).update({ verified_at: new Date(), verification_status: 'failed', verification_error: message });
    throw error;
  } finally {
    await target.destroy();
  }
}

async function restoreSnapshotIntoDatabase(target: Knex, snapshot: LogicalBackupSnapshot): Promise<number> {
  const tenantExists = await target('tenants').where({ id: snapshot.tenantId }).first();
  if (tenantExists) throw new ConflictError('Restore target already contains this tenant; use a fresh isolated database');
  const tableNames = Object.keys(snapshot.tables).filter((tableName) => snapshot.tables[tableName].length > 0);
  const tableSet = new Set(tableNames);
  const jsonColumnRows = await target('information_schema.columns')
    .where({ table_schema: 'public' })
    .whereIn('table_name', tableNames)
    .whereIn('data_type', ['json', 'jsonb'])
    .select('table_name', 'column_name');
  const jsonColumns = new Map<string, Set<string>>();
  for (const row of jsonColumnRows) {
    const columns = jsonColumns.get(row.table_name) || new Set<string>();
    columns.add(row.column_name);
    jsonColumns.set(row.table_name, columns);
  }
  const dependencies = new Map<string, Set<string>>(tableNames.map((tableName) => [tableName, new Set<string>()]));
  for (const foreignKey of await getForeignKeysFor(target)) {
    if (tableSet.has(foreignKey.tableName) && tableSet.has(foreignKey.foreignTableName) && foreignKey.tableName !== foreignKey.foreignTableName) {
      dependencies.get(foreignKey.tableName)?.add(foreignKey.foreignTableName);
    }
  }
  const orderedTables: string[] = [];
  const pending = new Set(tableNames);
  while (pending.size > 0) {
    const ready = [...pending].filter((tableName) => [...(dependencies.get(tableName) || [])].every((dependency) => !pending.has(dependency)));
    if (ready.length === 0) {
      throw new ConflictError(`Restore dependency cycle could not be resolved for ${[...pending].join(', ')}`);
    }
    for (const tableName of ready.sort()) {
      orderedTables.push(tableName);
      pending.delete(tableName);
    }
  }
  let total = 0;
  await target.transaction(async (trx) => {
    for (const tableName of orderedTables) {
      const rows = snapshot.tables[tableName].map((row) => {
        const normalized = { ...row };
        for (const columnName of jsonColumns.get(tableName) || []) {
          if (normalized[columnName] !== null && normalized[columnName] !== undefined) normalized[columnName] = JSON.stringify(normalized[columnName]);
        }
        return normalized;
      });
      await trx(tableName).insert(rows);
      total += rows.length;
    }
  });
  return total;
}

export async function applyBackupRetention(now = new Date()): Promise<number> {
  const expired = await db('backup_executions').where('status', 'completed').whereNotNull('retention_expires_at').where('retention_expires_at', '<', now).whereNull('artifact_deleted_at');
  let deleted = 0;
  for (const execution of expired) {
    try {
      if (execution.file_path) await deleteArtifact(artifactReference(execution));
      await db('backup_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'expired', artifact_deleted_at: new Date(), file_path: null });
      deleted += 1;
    } catch (error) {
      await db('backup_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ error: error instanceof Error ? error.message : 'Retention deletion failed' });
    }
  }
  return deleted;
}

export async function assertBackupArtifact(execution: Record<string, unknown>): Promise<void> {
  await assertArtifactExists(artifactReference(execution));
}

export function calculateBackupChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
