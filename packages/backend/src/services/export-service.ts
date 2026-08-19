import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Knex } from 'knex';
import { getEnv } from '@healthcare/shared/config';
import { ConflictError, ForbiddenError, ValidationError } from '@healthcare/shared/errors';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';
import { buildFhirBundle } from './fhir-export.js';

const EXPORT_HEADER = Buffer.from('HEALTH_ERP_EXPORT\0', 'utf8');
const EXPORT_ROOT = path.resolve(process.env.EXPORT_LOCAL_DIR || path.join(process.cwd(), 'exports'));
const WORKER_INTERVAL_MS = 60_000;
const STALE_PROCESSING_MINUTES = 60;
const DEFAULT_RETENTION_DAYS = 7;

export type ExportFormat = 'csv' | 'json' | 'fhir_json';

export interface ExportFilters {
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
  branchId?: string;
}

interface ExportTableConfig {
  name: string;
  columns: string[];
  dateColumn?: string;
  tenantScoped: boolean;
  parent?: { table: string; foreignKey: string; parentKey: string; dateColumn?: string };
}

interface ExportModuleConfig {
  tables: ExportTableConfig[];
  sensitiveFields: string[];
}

export interface ExportJobRow {
  id: string;
  tenant_id: string;
  module: string;
  format: ExportFormat;
  status: string;
  record_count: number;
  file_size: number;
  file_path: string | null;
  fhir_version: string | null;
  fhir_resource_type: string | null;
  error: string | null;
  trigger: string;
  started_at: Date | null;
  completed_at: Date | null;
  created_by: string | null;
  created_at: Date;
  requested_columns: unknown;
  filters: unknown;
  include_deleted: boolean;
  storage_location: string | null;
  checksum: string | null;
  mime_type: string | null;
  file_name: string | null;
  retention_days: number;
  artifact_expires_at: Date | null;
  artifact_deleted_at: Date | null;
}

interface ArtifactReference {
  storageLocation: string;
  key: string;
}

interface GeneratedExport {
  buffer: Buffer;
  rowCount: number;
  mimeType: string;
  fileName: string;
}

const EXPORT_MODULES: Record<string, ExportModuleConfig> = {
  patients: {
    tables: [{ name: 'patients', tenantScoped: true, dateColumn: 'created_at', columns: [
      'id', 'medical_record_number', 'first_name', 'last_name', 'date_of_birth', 'gender', 'nationality',
      'blood_type', 'email', 'phone', 'phone2', 'address', 'emergency_contact', 'insurance', 'allergies',
      'medical_history', 'marital_status', 'occupation', 'preferred_language', 'status', 'tags', 'created_at', 'updated_at',
    ] }],
    sensitiveFields: ['email', 'phone', 'phone2', 'address', 'emergency_contact', 'insurance', 'allergies', 'medical_history'],
  },
  appointments: {
    tables: [{ name: 'appointments', tenantScoped: true, dateColumn: 'appointment_date', columns: [
      'id', 'patient_id', 'doctor_id', 'branch_id', 'appointment_date', 'start_time', 'end_time', 'duration',
      'type', 'status', 'reason', 'notes', 'is_walk_in', 'is_virtual', 'check_in_time', 'check_out_time',
      'cancelled_at', 'cancel_reason', 'created_at', 'updated_at',
    ] }],
    sensitiveFields: ['reason', 'notes'],
  },
  emr: {
    tables: [{ name: 'emr_records', tenantScoped: true, dateColumn: 'encounter_date', columns: [
      'id', 'patient_id', 'appointment_id', 'doctor_id', 'encounter_date', 'encounter_type', 'chief_complaint',
      'subjective', 'objective', 'assessment', 'plan', 'diagnosis', 'procedures', 'medications', 'lab_orders',
      'radiology_orders', 'vitals', 'notes', 'status', 'created_at', 'updated_at',
    ] }],
    sensitiveFields: ['chief_complaint', 'subjective', 'objective', 'assessment', 'plan', 'diagnosis', 'procedures', 'medications', 'vitals', 'notes'],
  },
  billing: {
    tables: [
      { name: 'invoices', tenantScoped: true, dateColumn: 'issued_at', columns: [
        'id', 'patient_id', 'appointment_id', 'invoice_number', 'items', 'subtotal', 'discount', 'tax', 'total',
        'paid', 'due', 'status', 'payment_method', 'insurance_claim', 'notes', 'due_date', 'issued_at', 'paid_at', 'created_at', 'updated_at',
      ] },
      { name: 'payment_transactions', tenantScoped: true, dateColumn: 'created_at', columns: [
        'id', 'invoice_id', 'amount', 'method', 'reference', 'notes', 'status', 'created_at',
      ] },
    ],
    sensitiveFields: ['notes', 'reference'],
  },
  laboratory: {
    tables: [
      { name: 'lab_orders', tenantScoped: true, dateColumn: 'order_date', columns: [
        'id', 'patient_id', 'doctor_id', 'appointment_id', 'emr_record_id', 'order_number', 'status', 'priority',
        'order_date', 'collected_at', 'completed_at', 'clinical_notes', 'results_summary', 'results', 'created_at', 'updated_at',
      ] },
      { name: 'lab_tests', tenantScoped: false, parent: { table: 'lab_orders', foreignKey: 'order_id', parentKey: 'id', dateColumn: 'order_date' }, columns: [
        'id', 'order_id', 'test_code', 'test_name', 'specimen_type', 'result_value', 'result_unit', 'reference_range', 'status', 'notes', 'created_at', 'updated_at',
      ] },
    ],
    sensitiveFields: ['clinical_notes', 'results_summary', 'results', 'result_value', 'notes'],
  },
  pharmacy: {
    tables: [
      { name: 'pharmacy_prescriptions', tenantScoped: true, dateColumn: 'created_at', columns: [
        'id', 'patient_id', 'doctor_id', 'emr_record_id', 'prescription_number', 'status', 'notes', 'clinical_override_reason', 'created_at', 'updated_at',
      ] },
      { name: 'pharmacy_prescription_items', tenantScoped: false, parent: { table: 'pharmacy_prescriptions', foreignKey: 'prescription_id', parentKey: 'id', dateColumn: 'created_at' }, columns: [
        'id', 'prescription_id', 'drug_name', 'dosage', 'route', 'frequency', 'duration', 'quantity', 'quantity_dispensed', 'refills', 'instructions', 'status', 'created_at',
      ] },
      { name: 'pharmacy_dispense_requests', tenantScoped: true, dateColumn: 'created_at', columns: [
        'id', 'prescription_id', 'patient_id', 'idempotency_key', 'status', 'override_reason', 'error_message', 'created_at', 'updated_at',
      ] },
      { name: 'pharmacy_dispense_records', tenantScoped: true, dateColumn: 'created_at', columns: [
        'id', 'request_id', 'prescription_id', 'prescription_item_id', 'inventory_id', 'quantity', 'batch_number', 'expiry_date', 'unit_price', 'created_at',
      ] },
      { name: 'pharmacy_inventory', tenantScoped: true, dateColumn: 'created_at', columns: [
        'id', 'drug_name', 'generic_name', 'brand_name', 'dosage_form', 'strength', 'stock_quantity', 'reorder_level', 'unit_price',
        'batch_number', 'expiry_date', 'manufacturer', 'requires_prescription', 'status', 'created_at', 'updated_at',
      ] },
    ],
    sensitiveFields: ['notes', 'clinical_override_reason', 'override_reason', 'error_message', 'idempotency_key'],
  },
  radiology: {
    tables: [{ name: 'radiology_orders', tenantScoped: true, dateColumn: 'order_date', columns: [
      'id', 'patient_id', 'doctor_id', 'appointment_id', 'order_number', 'study_type', 'body_part', 'status', 'priority',
      'order_date', 'scheduled_date', 'clinical_indication', 'findings', 'impression', 'report', 'created_at', 'updated_at',
    ] }],
    sensitiveFields: ['clinical_indication', 'findings', 'impression', 'report'],
  },
  inventory: {
    tables: [
      { name: 'inventory_items', tenantScoped: true, dateColumn: 'created_at', columns: [
        'id', 'warehouse_id', 'sku', 'name', 'category', 'unit', 'quantity', 'reorder_point', 'unit_cost', 'unit_price',
        'batch_number', 'expiry_date', 'serial_number', 'manufacturer', 'supplier', 'description', 'status', 'last_restocked_at', 'created_at', 'updated_at',
      ] },
      { name: 'purchase_orders', tenantScoped: true, dateColumn: 'order_date', columns: [
        'id', 'warehouse_id', 'po_number', 'supplier', 'status', 'total_amount', 'order_date', 'expected_date', 'received_date', 'notes', 'created_at', 'updated_at',
      ] },
    ],
    sensitiveFields: ['unit_cost', 'supplier', 'notes'],
  },
  hr: {
    tables: [
      { name: 'employees', tenantScoped: true, dateColumn: 'hire_date', columns: [
        'id', 'employee_code', 'first_name', 'last_name', 'email', 'phone', 'department', 'position', 'employment_type',
        'hire_date', 'termination_date', 'status', 'pay_frequency', 'created_at', 'updated_at',
      ] },
      { name: 'attendance', tenantScoped: true, dateColumn: 'date', columns: ['id', 'employee_id', 'date', 'clock_in', 'clock_out', 'status', 'notes', 'created_at'] },
      { name: 'leave_requests', tenantScoped: true, dateColumn: 'start_date', columns: ['id', 'employee_id', 'leave_type', 'start_date', 'end_date', 'total_days', 'status', 'reason', 'manager_notes', 'created_at', 'updated_at'] },
    ],
    sensitiveFields: ['email', 'phone', 'notes', 'reason', 'manager_notes'],
  },
  insurance: {
    tables: [
      { name: 'insurance_companies', tenantScoped: true, dateColumn: 'created_at', columns: ['id', 'name', 'code', 'contract_type', 'discount_rate', 'coverage_plans', 'is_active', 'created_at'] },
      { name: 'insurance_claims', tenantScoped: true, dateColumn: 'created_at', columns: ['id', 'patient_id', 'invoice_id', 'insurance_id', 'claim_number', 'status', 'claimed_amount', 'approved_amount', 'paid_amount', 'submission_date', 'response_date', 'notes', 'denial_reason', 'created_at', 'updated_at'] },
    ],
    sensitiveFields: ['notes', 'denial_reason'],
  },
  telemedicine: {
    tables: [{ name: 'telemedicine_sessions', tenantScoped: true, dateColumn: 'created_at', columns: [
      'id', 'patient_id', 'doctor_id', 'appointment_id', 'session_id', 'room_name', 'status', 'provider', 'started_at', 'ended_at', 'duration_seconds', 'recording_enabled', 'notes', 'created_at', 'updated_at',
    ] }],
    sensitiveFields: ['session_id', 'room_name', 'notes'],
  },
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function parseFilters(value: unknown): ExportFilters {
  const filters = parseJson<Record<string, unknown>>(value, {});
  const result: ExportFilters = {};
  for (const key of ['dateFrom', 'dateTo', 'patientId', 'branchId'] as const) {
    const raw = filters[key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') result[key] = String(raw).trim();
  }
  if (result.dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(result.dateFrom)) throw new ValidationError('dateFrom must use YYYY-MM-DD');
  if (result.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(result.dateTo)) throw new ValidationError('dateTo must use YYYY-MM-DD');
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) throw new ValidationError('dateFrom cannot be after dateTo');
  return result;
}

function parseColumns(value: unknown): string[] {
  const parsed = parseJson<unknown[]>(value, []);
  if (!Array.isArray(parsed)) throw new ValidationError('columns must be an array');
  return [...new Set(parsed.map(String).map((column) => column.trim()).filter(Boolean))];
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function formatConfig(format: unknown): ExportFormat {
  const normalized = String(format || 'csv').toLowerCase();
  if (!['csv', 'json', 'fhir_json'].includes(normalized)) throw new ValidationError('Only CSV, JSON, and FHIR JSON (R4) exports are supported');
  return normalized as ExportFormat;
}

function moduleConfig(module: string): ExportModuleConfig {
  const config = EXPORT_MODULES[module];
  if (!config) throw new ValidationError(`Unsupported export module: ${module}`);
  return config;
}

function authorizedFor(ctx: { permissions: string[] }, permission: string): boolean {
  return ctx.permissions.includes(permission) || ctx.permissions.includes('*') || ctx.permissions.includes(`${permission.split('.')[0]}.*`);
}

function assertRequestedColumns(config: ExportModuleConfig, requestedColumns: string[]): void {
  if (requestedColumns.length === 0) return;
  const allowed = new Set(config.tables.flatMap((table) => table.columns));
  const invalid = requestedColumns.filter((column) => !allowed.has(column));
  if (invalid.length > 0) throw new ValidationError('Export contains unsupported columns', { columns: invalid });
}

function selectedColumns(table: ExportTableConfig, requested: string[]): string[] {
  if (requested.length === 0) return table.columns;
  const selected = table.columns.filter((column) => requested.includes(column));
  return selected.length > 0 ? selected : (table.columns.includes('id') ? ['id'] : []);
}

function applyTenantAndFilters(
  query: Knex.QueryBuilder,
  table: ExportTableConfig,
  tenantId: string,
  filters: ExportFilters,
  includeDeleted: boolean,
): Knex.QueryBuilder {
  if (table.tenantScoped) query.where(`${table.name}.tenant_id`, tenantId);
  if (!includeDeleted && table.columns.includes('deleted_at')) query.whereNull(`${table.name}.deleted_at`);
  if (filters.dateFrom && (table.dateColumn || table.parent?.dateColumn)) query.where(`${table.name}.${table.dateColumn || table.parent?.dateColumn}`, '>=', filters.dateFrom);
  if (filters.dateTo && (table.dateColumn || table.parent?.dateColumn)) query.where(`${table.name}.${table.dateColumn || table.parent?.dateColumn}`, '<=', filters.dateTo);
  if (filters.patientId && table.columns.includes('patient_id')) query.where(`${table.name}.patient_id`, filters.patientId);
  if (filters.branchId && table.columns.includes('branch_id')) query.where(`${table.name}.branch_id`, filters.branchId);
  return query;
}

async function readTableRows(
  table: ExportTableConfig,
  module: ExportModuleConfig,
  tenantId: string,
  filters: ExportFilters,
  requestedColumns: string[],
  includeDeleted: boolean,
): Promise<Array<Record<string, unknown>>> {
  const columns = selectedColumns(table, requestedColumns);
  let query = db(table.name).select(columns.map((column) => `${table.name}.${column}`));
  if (table.parent) {
    const parentQuery = db(table.parent.table).select(`${table.parent.table}.${table.parent.parentKey}`);
    applyTenantAndFilters(parentQuery, {
      name: table.parent.table,
      tenantScoped: true,
      columns: ['id', 'tenant_id', 'patient_id', 'branch_id', 'deleted_at'],
      dateColumn: table.parent.dateColumn,
    }, tenantId, filters, includeDeleted);
    query.whereIn(`${table.name}.${table.parent.foreignKey}`, parentQuery);
  } else {
    applyTenantAndFilters(query, table, tenantId, filters, includeDeleted);
  }
  const rows = await query.orderBy(`${table.name}.id`, 'asc');
  return rows.map((row: Record<string, unknown>) => {
    const result: Record<string, unknown> = { sourceTable: table.name };
    for (const column of columns) result[column] = row[column];
    return result;
  });
}

async function collectRows(module: string, tenantId: string, filters: ExportFilters, requestedColumns: string[], includeDeleted: boolean): Promise<Record<string, Array<Record<string, unknown>>>> {
  const config = moduleConfig(module);
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of config.tables) {
    tables[table.name] = await readTableRows(table, config, tenantId, filters, requestedColumns, includeDeleted);
  }
  return tables;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(tables: Record<string, Array<Record<string, unknown>>>): Buffer {
  const rows: Array<Record<string, unknown>> = Object.entries(tables).flatMap(([table, tableRows]) => tableRows.map((row) => ({ ...row, sourceTable: table })));
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))];
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function countRows(tables: Record<string, Array<Record<string, unknown>>>): number {
  return Object.values(tables).reduce((count, rows) => count + rows.length, 0);
}

function encryptExport(plaintext: Buffer): Buffer {
  const configuredKey = process.env.EXPORT_ENCRYPTION_KEY || getEnv().ENCRYPTION_KEY;
  if (!configuredKey || configuredKey.length < 32) throw new ConflictError('Export encryption is not configured with a sufficiently strong key');
  const key = crypto.createHash('sha256').update(configuredKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([EXPORT_HEADER, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptExport(encrypted: Buffer): Buffer {
  if (!encrypted.subarray(0, EXPORT_HEADER.length).equals(EXPORT_HEADER)) throw new ConflictError('Export artifact format is invalid');
  const ivStart = EXPORT_HEADER.length;
  const iv = encrypted.subarray(ivStart, ivStart + 12);
  const authTag = encrypted.subarray(ivStart + 12, ivStart + 28);
  const ciphertext = encrypted.subarray(ivStart + 28);
  const configuredKey = process.env.EXPORT_ENCRYPTION_KEY || getEnv().ENCRYPTION_KEY;
  if (!configuredKey || configuredKey.length < 32) throw new ConflictError('Export encryption is not configured with a sufficiently strong key');
  try {
    const key = crypto.createHash('sha256').update(configuredKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new ConflictError('Export artifact authentication failed');
  }
}

function parseStorageLocation(location: string, tenantId: string, jobId: string, extension: string): ArtifactReference {
  const trimmed = location.trim();
  const fileName = `${jobId}.${extension}`;
  if (trimmed.startsWith('minio://')) {
    const parts = trimmed.slice('minio://'.length).replace(/^\/+/, '').split('/').filter(Boolean);
    const bucket = parts.shift();
    if (!bucket) throw new ValidationError('MinIO export storage location must include a bucket');
    return { storageLocation: trimmed, key: [...parts, tenantId, fileName].join('/') };
  }
  if (trimmed.startsWith('local://') || trimmed.startsWith('file://')) {
    const prefix = trimmed.replace(/^(local|file):\/\//, '').replace(/^\/+|\/+$/g, '');
    return { storageLocation: trimmed, key: path.join(prefix, tenantId, fileName) };
  }
  throw new ValidationError('Export storage location must use minio:// or local://');
}

function minioClient(): S3Client {
  const env = getEnv();
  return new S3Client({
    endpoint: `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
    region: 'us-east-1',
    credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY },
    forcePathStyle: true,
  });
}

function minioBucket(location: string): string {
  const bucket = location.slice('minio://'.length).replace(/^\/+/, '').split('/').filter(Boolean)[0];
  if (!bucket) throw new ValidationError('MinIO export bucket is missing');
  return bucket;
}

async function putArtifact(reference: ArtifactReference, encrypted: Buffer, mimeType: string): Promise<void> {
  if (reference.storageLocation.startsWith('minio://')) {
    await minioClient().send(new PutObjectCommand({ Bucket: minioBucket(reference.storageLocation), Key: reference.key, Body: encrypted, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256', Metadata: { 'content-type': mimeType } }));
    return;
  }
  const target = path.resolve(EXPORT_ROOT, reference.key);
  if (!target.startsWith(`${EXPORT_ROOT}${path.sep}`)) throw new ConflictError('Export path escapes the configured local storage root');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, encrypted, { flag: 'wx' });
}

async function getArtifact(reference: ArtifactReference): Promise<Buffer> {
  if (reference.storageLocation.startsWith('minio://')) {
    const result = await minioClient().send(new GetObjectCommand({ Bucket: minioBucket(reference.storageLocation), Key: reference.key }));
    if (!result.Body) throw new ConflictError('Export artifact body is empty');
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  const target = path.resolve(EXPORT_ROOT, reference.key);
  if (!target.startsWith(`${EXPORT_ROOT}${path.sep}`)) throw new ConflictError('Export path escapes the configured local storage root');
  return fs.readFile(target);
}

async function deleteArtifact(reference: ArtifactReference): Promise<void> {
  if (reference.storageLocation.startsWith('minio://')) {
    await minioClient().send(new DeleteObjectCommand({ Bucket: minioBucket(reference.storageLocation), Key: reference.key }));
    return;
  }
  const target = path.resolve(EXPORT_ROOT, reference.key);
  if (!target.startsWith(`${EXPORT_ROOT}${path.sep}`)) throw new ConflictError('Export path escapes the configured local storage root');
  await fs.rm(target, { force: true });
}

function artifactReference(job: Pick<ExportJobRow, 'storage_location' | 'file_path'>): ArtifactReference {
  if (!job.storage_location || !job.file_path) throw new ConflictError('Export artifact is not available');
  const storageLocation = String(job.storage_location);
  if (!storageLocation.startsWith('local://') && !storageLocation.startsWith('file://') && !storageLocation.startsWith('minio://')) throw new ConflictError('Export artifact storage location is invalid');
  const key = String(job.file_path).replaceAll('\\', '/');
  if (key.includes('..') || key.startsWith('/') || key.includes('\0')) throw new ConflictError('Export artifact reference is invalid');
  return { storageLocation, key };
}

function parseRetentionDays(value: unknown): number {
  const days = Number(value || DEFAULT_RETENTION_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ValidationError('retentionDays must be between 1 and 3650');
  return days;
}

function mimeFor(format: ExportFormat): string {
  if (format === 'csv') return 'text/csv; charset=utf-8';
  return format === 'fhir_json' ? 'application/fhir+json; charset=utf-8' : 'application/json; charset=utf-8';
}

async function generateExport(job: ExportJobRow): Promise<GeneratedExport> {
  const filters = parseFilters(job.filters);
  const requestedColumns = parseColumns(job.requested_columns);
  const config = moduleConfig(job.module);
  assertRequestedColumns(config, requestedColumns);
  let plaintext: Buffer;
  if (job.format === 'fhir_json') {
    const bundle = await buildFhirBundle(job.tenant_id, job.fhir_resource_type || undefined, filters, job.include_deleted);
    plaintext = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  } else {
    const tables = await collectRows(job.module, job.tenant_id, filters, requestedColumns, job.include_deleted);
    plaintext = job.format === 'csv'
      ? rowsToCsv(tables)
      : Buffer.from(`${JSON.stringify({ formatVersion: 1, module: job.module, generatedAt: new Date().toISOString(), filters, tables }, null, 2)}\n`, 'utf8');
  }
  const extension = job.format === 'csv' ? 'csv' : 'json';
  return { buffer: encryptExport(plaintext), rowCount: job.format === 'fhir_json' ? -1 : 0, mimeType: mimeFor(job.format), fileName: `health-erp-export-${job.module}-${job.id}.${extension}` };
}

export async function processExportJob(job: ExportJobRow): Promise<void> {
  const extension = job.format === 'csv' ? 'csv' : 'json';
  const location = job.storage_location || process.env.EXPORT_STORAGE_LOCATION || 'local://exports';
  const reference = parseStorageLocation(location, job.tenant_id, job.id, extension);
  let artifactWritten = false;
  try {
    const generated = await generateExport(job);
    const checksum = crypto.createHash('sha256').update(generated.buffer).digest('hex');
    await putArtifact(reference, generated.buffer, generated.mimeType);
    artifactWritten = true;
    const plaintext = decryptExport(generated.buffer);
    const rowCount = job.format === 'fhir_json' ? countFhirEntries(plaintext) : countRowsInGenerated(job.format, plaintext);
    await db('export_jobs').where({ id: job.id, tenant_id: job.tenant_id }).update({
      status: 'completed', record_count: rowCount, file_size: generated.buffer.length, file_path: reference.key,
      storage_location: reference.storageLocation, checksum, mime_type: generated.mimeType, file_name: generated.fileName,
      retention_days: parseRetentionDays(job.retention_days), artifact_expires_at: new Date(Date.now() + parseRetentionDays(job.retention_days) * 86_400_000),
      completed_at: new Date(), error: null,
    });
    await logAudit({ tenantId: job.tenant_id, userId: job.created_by || undefined, action: 'export.completed', entityType: 'export_job', entityId: job.id, metadata: { module: job.module, format: job.format, recordCount: rowCount, fileSize: generated.buffer.length } });
  } catch (error) {
    if (artifactWritten) await deleteArtifact(reference).catch(() => {});
    await db('export_jobs').where({ id: job.id, tenant_id: job.tenant_id }).update({ status: 'failed', error: error instanceof Error ? error.message : 'Export failed', completed_at: new Date(), file_path: null, checksum: null, mime_type: null, file_name: null });
    await logAudit({ tenantId: job.tenant_id, userId: job.created_by || undefined, action: 'export.failed', entityType: 'export_job', entityId: job.id, metadata: { module: job.module, format: job.format, error: error instanceof Error ? error.message : 'Export failed' }, result: 'failed' });
  }
}

function countRowsInGenerated(format: ExportFormat, plaintext: Buffer): number {
  if (format === 'csv') {
    const text = plaintext.toString('utf8').trim();
    return text ? Math.max(0, text.split(/\r?\n/).length - 1) : 0;
  }
  const parsed = JSON.parse(plaintext.toString('utf8')) as { tables?: Record<string, unknown[]> };
  return Object.values(parsed.tables || {}).reduce((count, rows) => count + rows.length, 0);
}

function countFhirEntries(plaintext: Buffer): number {
  const parsed = JSON.parse(plaintext.toString('utf8')) as { entry?: unknown[] };
  return Array.isArray(parsed.entry) ? parsed.entry.length : 0;
}

async function claimNextExport(): Promise<ExportJobRow | null> {
  return db.transaction(async (trx) => {
    const job = await trx('export_jobs').where({ status: 'pending' }).orderBy('created_at', 'asc').forUpdate().skipLocked().first();
    if (!job) return null;
    await trx('export_jobs').where({ id: job.id, status: 'pending' }).update({ status: 'processing', started_at: new Date(), error: null });
    return { ...job, status: 'processing' } as ExportJobRow;
  });
}

async function recoverStaleExports(): Promise<void> {
  await db('export_jobs').where({ status: 'processing' }).where('started_at', '<', new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000)).update({ status: 'pending', started_at: null, error: 'Recovered after worker interruption' });
}

export async function applyExportRetention(now = new Date()): Promise<void> {
  const jobs = await db('export_jobs').where('status', 'completed').whereNotNull('artifact_expires_at').where('artifact_expires_at', '<', now).whereNull('artifact_deleted_at').whereNotNull('file_path');
  for (const job of jobs as ExportJobRow[]) {
    try {
      await deleteArtifact(artifactReference(job));
      await db('export_jobs').where({ id: job.id, tenant_id: job.tenant_id }).update({ artifact_deleted_at: now, file_path: null, checksum: null, mime_type: null, file_name: null });
      await logAudit({ tenantId: job.tenant_id, userId: job.created_by || undefined, action: 'export.artifact_deleted', entityType: 'export_job', entityId: job.id, metadata: { reason: 'retention_expired' } });
    } catch (error) {
      await db('export_jobs').where({ id: job.id, tenant_id: job.tenant_id }).update({ error: error instanceof Error ? error.message : 'Export retention cleanup failed' });
    }
  }
}

let workerInterval: NodeJS.Timeout | null = null;
let workerRunning = false;

export async function processPendingExportsOnce(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await recoverStaleExports();
    const job = await claimNextExport();
    if (job) await processExportJob(job);
    await applyExportRetention();
  } finally {
    workerRunning = false;
  }
}

export function startExportWorker(): void {
  if (workerInterval) return;
  processPendingExportsOnce().catch((error) => console.error('Export worker error:', error));
  workerInterval = setInterval(() => {
    processPendingExportsOnce().catch((error) => console.error('Export worker error:', error));
  }, WORKER_INTERVAL_MS);
  workerInterval.unref();
}

export function stopExportWorker(): void {
  if (!workerInterval) return;
  clearInterval(workerInterval);
  workerInterval = null;
}

export function getExportModules(): Array<{ module: string; tables: string[]; formats: ExportFormat[]; sensitiveFields: string[] }> {
  return Object.entries(EXPORT_MODULES).map(([module, config]) => ({ module, tables: config.tables.map((table) => table.name), formats: ['csv', 'json', 'fhir_json'], sensitiveFields: config.sensitiveFields }));
}

export function getExportDefinitionInput(body: Record<string, unknown>, ctx: { permissions: string[] }): {
  module: string;
  format: ExportFormat;
  requestedColumns: string[];
  filters: ExportFilters;
  includeDeleted: boolean;
  retentionDays: number;
  fhirResourceType: string | null;
} {
  const module = String(body.module || 'patients');
  const config = moduleConfig(module);
  const format = formatConfig(body.format);
  const requestedColumns = parseColumns(body.columns);
  assertRequestedColumns(config, requestedColumns);
  const includeDeleted = parseBoolean(body.includeDeleted, false);
  if (includeDeleted && !authorizedFor(ctx, 'data_export.manage')) throw new ForbiddenError('Deleted-record exports require data_export.manage');
  const filters = parseFilters(body.filters);
  return { module, format, requestedColumns, filters, includeDeleted, retentionDays: parseRetentionDays(body.retentionDays), fhirResourceType: format === 'fhir_json' ? (body.resourceType ? String(body.resourceType) : null) : null };
}

export async function readExportArtifact(job: ExportJobRow): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  if (job.status !== 'completed' || !job.file_path || job.artifact_deleted_at) throw new ConflictError('Export artifact is not ready');
  if (job.artifact_expires_at && new Date(job.artifact_expires_at).getTime() <= Date.now()) throw new ConflictError('Export artifact has expired');
  const encrypted = await getArtifact(artifactReference(job));
  if (job.checksum && crypto.createHash('sha256').update(encrypted).digest('hex') !== job.checksum) throw new ConflictError('Export artifact checksum verification failed');
  return { buffer: decryptExport(encrypted), mimeType: job.mime_type || 'application/octet-stream', fileName: job.file_name || `export-${job.id}` };
}
