import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ConflictError } from '@healthcare/shared/errors';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { verifyBackupExecution } from '../../services/backup-service.js';
import type { BackupConfigRow, BackupExecutionRow, PaginationQuery } from '../types.js';

export async function registerDrBackupModule(app: FastifyInstance) {
  // ── Backup Configs ──
  app.get('/api/v1/dr/backup-configs', { preHandler: [authenticate, authorize('dr_backup.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const configs = await db('backup_configs').where({ tenant_id: tenantId }).orderBy('name');
    return sendSuccess(reply, configs.map((c: BackupConfigRow) => ({
      id: c.id, name: c.name, type: c.type, schedule: c.schedule,
      retentionDays: c.retention_days, storageLocation: c.storage_location,
      includeSchemas: c.include_schemas, excludeTables: c.exclude_tables,
      isActive: c.is_active, lastBackupAt: c.last_backup_at
    })));
  });

  app.post('/api/v1/dr/backup-configs', { preHandler: [authenticate, authorize('dr_backup.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      type: z.enum(['logical']).default('logical'),
      schedule: z.string().trim().min(1).max(50).default('0 2 * * *'),
      retentionDays: z.number().int().min(1).max(3650).default(30),
      storageLocation: z.string().trim().min(1).max(500).default('minio://backups'),
      includeSchemas: z.array(z.string().max(100)).default(['public']),
      excludeTables: z.array(z.string().max(200)).default([]),
      isActive: z.boolean().default(true),
    }).parse(request.body);
    const [c] = await db('backup_configs').insert({
      tenant_id: tenantId, name: body.name, type: body.type, schedule: body.schedule,
      retention_days: body.retentionDays, storage_location: body.storageLocation,
      include_schemas: JSON.stringify(body.includeSchemas), exclude_tables: JSON.stringify(body.excludeTables), is_active: body.isActive,
    }).returning('*');
    return sendSuccess(reply, { id: c.id, name: c.name, status: body.isActive ? 'active' : 'disabled' }, 'Backup config created', 201);
  });

  app.put('/api/v1/dr/backup-configs/:id', { preHandler: [authenticate, authorize('dr_backup.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().trim().min(1).max(200).optional(), schedule: z.string().trim().min(1).max(50).optional(),
      retentionDays: z.number().int().min(1).max(3650).optional(), storageLocation: z.string().trim().min(1).max(500).optional(),
      excludeTables: z.array(z.string().max(200)).optional(), isActive: z.boolean().optional(),
    }).parse(request.body);
    const existing = await findTenantRow('backup_configs', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Backup config not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.schedule !== undefined) update.schedule = body.schedule;
    if (body.retentionDays !== undefined) update.retention_days = body.retentionDays;
    if (body.storageLocation !== undefined) update.storage_location = body.storageLocation;
    if (body.excludeTables !== undefined) update.exclude_tables = JSON.stringify(body.excludeTables);
    if (body.isActive !== undefined) update.is_active = body.isActive;
    await db('backup_configs').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Backup config updated');
  });

  // ── Backup Executions ──
  app.get('/api/v1/dr/backups', { preHandler: [authenticate, authorize('dr_backup.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status } = request.query as PaginationQuery & { status?: string };
    let q = db('backup_executions').where('backup_executions.tenant_id', tenantId);
    if (status) q = q.andWhere('status', status);
    const backups = await q.leftJoin('backup_configs', 'backup_executions.config_id', 'backup_configs.id')
      .select('backup_executions.*', 'backup_configs.name as config_name')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, backups.map((b: Record<string, unknown>) => ({
      id: b.id, configId: b.config_id, configName: b.config_name,
      status: b.status, type: b.type, sizeBytes: b.size_bytes, rowCount: b.row_count,
      filePath: b.file_path, checksum: b.checksum, error: b.error,
      retentionExpiresAt: b.retention_expires_at, artifactDeletedAt: b.artifact_deleted_at,
      verifiedAt: b.verified_at, verificationStatus: b.verification_status, verificationError: b.verification_error,
      trigger: b.trigger, startedAt: b.started_at, completedAt: b.completed_at
    })));
  });

  app.post('/api/v1/dr/backups/run', { preHandler: [authenticate, authorize('dr_backup.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({ configId: z.string().uuid().optional() }).parse(request.body || {});
    let config: Record<string, unknown> | undefined;
    if (body.configId) {
      config = await findTenantRow('backup_configs', body.configId, tenantId) as Record<string, unknown> | undefined;
      if (!config) return reply.status(404).send({ success: false, error: 'Backup config not found' });
    } else {
      config = await db('backup_configs').where({ tenant_id: tenantId, is_active: true }).orderBy('created_at', 'asc').first();
    }
    if (!config) throw new ConflictError('Create and activate a backup configuration before running a backup');
    const [backup] = await db('backup_executions').insert({
      tenant_id: tenantId, config_id: config.id, type: config.type || 'logical', status: 'pending', trigger: 'manual',
      retention_days: config.retention_days || 30, storage_location: config.storage_location,
      exclude_tables: typeof config.exclude_tables === 'string' ? config.exclude_tables : JSON.stringify(config.exclude_tables || []),
    }).returning('*');
    return sendSuccess(reply, { id: backup.id, status: 'pending' }, 'Backup queued for durable processing', 201);
  });

  app.post('/api/v1/dr/backups/:id/verify-restore', { preHandler: [authenticate, authorize('dr_backup.verify')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const result = await verifyBackupExecution(tenantId, id);
    return sendSuccess(reply, result, 'Backup restore verification completed');
  });

  app.get('/api/v1/dr/restore-verifications', { preHandler: [authenticate, authorize('dr_backup.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const rows = await db('backup_restore_verifications').where({ tenant_id: tenantId }).orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, rows.map((row: Record<string, unknown>) => ({
      id: row.id, backupExecutionId: row.backup_execution_id, status: row.status, targetReference: row.target_reference,
      rowCount: row.row_count, checksum: row.checksum, error: row.error, startedAt: row.started_at, completedAt: row.completed_at,
    })));
  });

  // ── DR Config ──
  app.get('/api/v1/dr/config', { preHandler: [authenticate, authorize('dr_backup.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const dr = await db('dr_configs').where({ tenant_id: tenantId }).first();
    if (!dr) return sendSuccess(reply, {
      configured: false, replicationRegion: null, failoverStrategy: 'manual',
      rpoMinutes: null, rtoMinutes: null, crossRegionReplication: false,
      secondaryRegion: null, status: 'not_configured'
    });
    return sendSuccess(reply, {
      id: dr.id, replicationRegion: dr.replication_region,
      failoverStrategy: dr.failover_strategy, rpoMinutes: dr.rpo_minutes,
      rtoMinutes: dr.rto_minutes, crossRegionReplication: dr.cross_region_replication,
      secondaryRegion: dr.secondary_region, status: dr.status,
      lastDrTestAt: dr.last_dr_test_at
    });
  });

  app.put('/api/v1/dr/config', { preHandler: [authenticate, authorize('dr_backup.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({
      failoverStrategy: z.enum(['manual', 'automatic']).optional(), rpoMinutes: z.number().int().min(1).max(525600).optional(),
      rtoMinutes: z.number().int().min(1).max(525600).optional(), crossRegionReplication: z.boolean().optional(), secondaryRegion: z.string().trim().max(100).nullable().optional(),
    }).parse(request.body);
    const existing = await db('dr_configs').where({ tenant_id: tenantId }).first();
    const data: Record<string, unknown> = { updated_at: new Date(), status: 'healthy' };
    if (body.failoverStrategy !== undefined) data.failover_strategy = body.failoverStrategy;
    if (body.rpoMinutes !== undefined) data.rpo_minutes = body.rpoMinutes;
    if (body.rtoMinutes !== undefined) data.rto_minutes = body.rtoMinutes;
    if (body.crossRegionReplication !== undefined) data.cross_region_replication = body.crossRegionReplication;
    if (body.secondaryRegion !== undefined) data.secondary_region = body.secondaryRegion;
    if (existing) await db('dr_configs').where({ tenant_id: tenantId }).update(data);
    else await db('dr_configs').insert({ tenant_id: tenantId, ...data });
    return sendSuccess(reply, null, 'DR config updated');
  });

  app.post('/api/v1/dr/test', { preHandler: [authenticate, authorize('dr_backup.verify')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({ backupId: z.string().uuid().optional() }).parse(request.body || {});
    const backup = body.backupId
      ? await db('backup_executions').where({ id: body.backupId, tenant_id: tenantId, status: 'completed' }).first()
      : await db('backup_executions').where({ tenant_id: tenantId, status: 'completed' }).orderBy('completed_at', 'desc').first();
    if (!backup) throw new ConflictError('A completed backup is required before a restore verification drill');
    const result = await verifyBackupExecution(tenantId, String(backup.id));
    await db('dr_configs').where({ tenant_id: tenantId }).update({ last_dr_test_at: new Date(), status: 'healthy', updated_at: new Date() });
    return sendSuccess(reply, result, 'DR restore verification completed');
  });
}
