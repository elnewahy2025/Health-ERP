import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import knex from 'knex';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/database.js';
import { errorHandler } from '../../core/error-handler.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const {
  applyBackupRetention,
  processPendingBackupsOnce,
  verifyBackupExecution,
} = await import('../../services/backup-service.js');
const { registerDrBackupModule } = await import('../dr-backup/index.js');

const enabled = process.env.RUN_BACKUP_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;
const restoreDatabase = process.env.BACKUP_VERIFY_DB_NAME;
const backupRoot = path.resolve(process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), 'backups'));

const IDS = {
  tenant: 'b1000000-0000-0000-0000-000000000001',
  branch: 'b2000000-0000-0000-0000-000000000001',
};

describeDatabase('backup and restore PostgreSQL integration suite', () => {
  let configId: string;
  let executionId: string;
  let app: ReturnType<typeof Fastify>;
  let currentGrants: Array<{ permission: string; scope: 'tenant' }> = [{ permission: 'dr_backup.view', scope: 'tenant' }];
  const restoreDb = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5432), database: restoreDatabase,
      user: process.env.BACKUP_VERIFY_DB_USER || process.env.DB_USER || 'health_erp_test', password: process.env.BACKUP_VERIFY_DB_PASSWORD || process.env.DB_PASSWORD || 'health_erp_test',
    },
    pool: { min: 1, max: 2 },
  });

  beforeAll(async () => {
    if (!restoreDatabase) throw new Error('BACKUP_VERIFY_DB_NAME is required for the backup integration suite');
    await db.transaction(async (trx) => {
      await trx('backup_restore_verifications').where({ tenant_id: IDS.tenant }).delete();
      await trx('backup_executions').where({ tenant_id: IDS.tenant }).delete();
      await trx('backup_configs').where({ tenant_id: IDS.tenant }).delete();
      await trx('branches').where({ id: IDS.branch }).delete();
      await trx('tenants').where({ id: IDS.tenant }).delete();
      await trx('tenants').insert({ id: IDS.tenant, name: 'Backup Integration Tenant', slug: 'backup-integration-tenant', status: 'active' });
      await trx('branches').insert({ id: IDS.branch, tenant_id: IDS.tenant, name: 'Backup Branch', code: 'BACKUP', phone: '0000000020' });
      const [config] = await trx('backup_configs').insert({
        tenant_id: IDS.tenant, name: 'Integration backup', type: 'logical', schedule: '@daily', retention_days: 30,
        storage_location: 'local://backup-integration', include_schemas: JSON.stringify(['public']), exclude_tables: JSON.stringify([]), is_active: true,
      }).returning('id');
      configId = String(config.id);
      const [execution] = await trx('backup_executions').insert({
        tenant_id: IDS.tenant, config_id: configId, type: 'logical', status: 'pending', trigger: 'manual',
        retention_days: 30, storage_location: 'local://backup-integration', exclude_tables: JSON.stringify([]),
      }).returning('id');
      executionId = String(execution.id);
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = IDS.tenant;
      req.ctx = {
        tenantId: IDS.tenant, userId: 'backup-integration-user', roles: [], permissions: currentGrants.map((grant) => grant.permission),
        branches: [IDS.branch], locale: 'en', requestId: request.id,
        principal: { kind: 'user', id: 'backup-integration-user', tenantId: IDS.tenant, roles: [], grants: currentGrants, denials: [], branches: [IDS.branch], departmentId: null, locale: 'en', permVersion: 1, status: 'active' },
      };
    });
    await registerDrBackupModule(app);
  });

  afterAll(async () => {
    await app?.close();
    await db('backup_restore_verifications').where({ tenant_id: IDS.tenant }).delete();
    await db('backup_executions').where({ tenant_id: IDS.tenant }).delete();
    await db('backup_configs').where({ tenant_id: IDS.tenant }).delete();
    await db('branches').where({ id: IDS.branch }).delete();
    await db('tenants').where({ id: IDS.tenant }).delete();
    await fs.rm(path.join(backupRoot, 'backup-integration'), { recursive: true, force: true });
    await restoreDb.destroy();
    await db.destroy();
  });

  it('keeps backup mutation and restore verification permissions separate from view access', async () => {
    currentGrants = [{ permission: 'dr_backup.view', scope: 'tenant' }];
    const denied = await app.inject({ method: 'POST', url: '/api/v1/dr/backup-configs', payload: { name: 'Denied backup' } });
    expect(denied.statusCode).toBe(403);

    currentGrants = [{ permission: 'dr_backup.create', scope: 'tenant' }];
    const created = await app.inject({ method: 'POST', url: '/api/v1/dr/backup-configs', payload: { name: 'Route backup', storageLocation: 'local://backup-integration' } });
    expect(created.statusCode).toBe(201);
    const createdId = created.json().data.id as string;
    await db('backup_configs').where({ id: createdId, tenant_id: IDS.tenant }).delete();

    const verifyDenied = await app.inject({ method: 'POST', url: `/api/v1/dr/backups/${executionId}/verify-restore`, payload: {} });
    expect(verifyDenied.statusCode).toBe(403);
  });

  it('creates a real encrypted artifact with measured size, checksum, and row count', async () => {
    await processPendingBackupsOnce();
    const execution = await db('backup_executions').where({ id: executionId, tenant_id: IDS.tenant }).first();
    expect(execution).toMatchObject({ status: 'completed', config_id: configId });
    expect(Number(execution.size_bytes)).toBeGreaterThan(0);
    expect(Number(execution.row_count)).toBeGreaterThanOrEqual(2);
    expect(String(execution.checksum)).toMatch(/^[a-f0-9]{64}$/);
    expect(String(execution.checksum)).not.toContain('simulated');
    expect(execution.file_path).toContain('local://backup-integration');
    await expect(fs.access(path.join(backupRoot, 'backup-integration', IDS.tenant, `${executionId}.backup.enc`))).resolves.toBeUndefined();
  });

  it('restores into the separately migrated database and records a completed verification', async () => {
    const result = await verifyBackupExecution(IDS.tenant, executionId);
    expect(result).toMatchObject({ status: 'completed', targetDatabase: restoreDatabase });
    expect(Number(result.rowCount)).toBeGreaterThanOrEqual(2);
    const verification = await db('backup_restore_verifications').where({ backup_execution_id: executionId, tenant_id: IDS.tenant }).first();
    expect(verification).toMatchObject({ status: 'completed', target_reference: restoreDatabase });
    const restoredTenant = await restoreDb('tenants').where({ id: IDS.tenant }).first();
    const restoredBranch = await restoreDb('branches').where({ id: IDS.branch, tenant_id: IDS.tenant }).first();
    expect(restoredTenant).toMatchObject({ id: IDS.tenant, slug: 'backup-integration-tenant' });
    expect(restoredBranch).toMatchObject({ id: IDS.branch, code: 'BACKUP' });
    const backup = await db('backup_executions').where({ id: executionId }).first();
    expect(backup.verification_status).toBe('passed');
  });

  it('deletes expired artifacts while retaining the execution audit row', async () => {
    await db('backup_executions').where({ id: executionId, tenant_id: IDS.tenant }).update({ retention_expires_at: new Date(Date.now() - 1000) });
    expect(await applyBackupRetention()).toBe(1);
    const execution = await db('backup_executions').where({ id: executionId, tenant_id: IDS.tenant }).first();
    expect(execution).toMatchObject({ status: 'expired' });
    expect(execution.file_path).toBeNull();
    expect(execution.artifact_deleted_at).not.toBeNull();
    await expect(fs.access(path.join(backupRoot, 'backup-integration', IDS.tenant, `${executionId}.backup.enc`))).rejects.toThrow();
  });
});
