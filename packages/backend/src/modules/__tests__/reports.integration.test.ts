import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/database.js';
import { errorHandler } from '../../core/error-handler.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const { registerReportsModule } = await import('../reports/index.js');
const { applyReportRetention, processPendingReportsOnce } = await import('../../services/report-service.js');

const enabled = process.env.RUN_REPORTS_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;
const reportRoot = process.env.REPORT_LOCAL_DIR || process.env.EXPORT_LOCAL_DIR || '/tmp/health-erp-report-test';

const IDS = {
  tenantA: 'f4000000-0000-0000-0000-000000000001',
  tenantB: 'f4000000-0000-0000-0000-000000000002',
  branchA: 'f4100000-0000-0000-0000-000000000001',
  branchB: 'f4100000-0000-0000-0000-000000000002',
  userA: 'f4200000-0000-0000-0000-000000000001',
  userB: 'f4200000-0000-0000-0000-000000000002',
  patientA: 'f4300000-0000-0000-0000-000000000001',
  patientB: 'f4300000-0000-0000-0000-000000000002',
};

const allGrants = [
  { permission: 'reports.view', scope: 'branch' as const, effect: 'ALLOW' as const, source: 'user' as const },
  { permission: 'reports.manage', scope: 'branch' as const, effect: 'ALLOW' as const, source: 'user' as const },
  { permission: 'reports.export', scope: 'branch' as const, effect: 'ALLOW' as const, source: 'user' as const },
  { permission: 'reports.download', scope: 'branch' as const, effect: 'ALLOW' as const, source: 'user' as const },
];

describeDatabase('reports PostgreSQL integration suite', () => {
  let app: ReturnType<typeof Fastify>;
  let currentTenant = IDS.tenantA;
  let currentUser = IDS.userA;
  let currentBranches = [IDS.branchA];
  let currentGrants = allGrants;
  let reportId: string;
  let csvExecutionId: string;

  beforeAll(async () => {
    await db.transaction(async (trx) => {
      await trx('report_executions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('report_definitions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('patients').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('branches').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('users').whereIn('id', [IDS.userA, IDS.userB]).delete();
      await trx('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();

      await trx('tenants').insert([
        { id: IDS.tenantA, name: 'Report Tenant A', slug: 'report-tenant-a', locale: 'en', status: 'active' },
        { id: IDS.tenantB, name: 'Report Tenant B', slug: 'report-tenant-b', locale: 'en', status: 'active' },
      ]);
      await trx('branches').insert([
        { id: IDS.branchA, tenant_id: IDS.tenantA, name: 'Main Branch', code: 'MAIN', phone: '+10000000101', status: 'active' },
        { id: IDS.branchB, tenant_id: IDS.tenantA, name: 'Other Branch', code: 'OTHER', phone: '+10000000102', status: 'active' },
      ]);
      await trx('users').insert([
        { id: IDS.userA, tenant_id: IDS.tenantA, email: 'report-a@example.test', password_hash: 'test-hash-a', first_name: 'Report', last_name: 'Operator', status: 'active' },
        { id: IDS.userB, tenant_id: IDS.tenantB, email: 'report-b@example.test', password_hash: 'test-hash-b', first_name: 'Other', last_name: 'Operator', status: 'active' },
      ]);
      await trx('patients').insert([
        { id: IDS.patientA, tenant_id: IDS.tenantA, branch_id: IDS.branchA, medical_record_number: 'REPORT-A-001', first_name: 'Alice', last_name: 'Main', date_of_birth: '1980-01-01', gender: 'female', phone: '+10000000201', status: 'active', created_by: IDS.userA },
        { id: IDS.patientB, tenant_id: IDS.tenantA, branch_id: IDS.branchB, medical_record_number: 'REPORT-B-001', first_name: 'Bob', last_name: 'Other', date_of_birth: '1981-01-01', gender: 'male', phone: '+10000000202', status: 'active', created_by: IDS.userA },
      ]);
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentTenant;
      req.ctx = {
        tenantId: currentTenant, userId: currentUser, roles: [], permissions: currentGrants.map((grant) => grant.permission), branches: currentBranches, locale: 'en', requestId: request.id,
        principal: { kind: 'user', id: currentUser, tenantId: currentTenant, roles: [], grants: currentGrants, denials: [], branches: currentBranches, departmentId: null, locale: 'en', permVersion: 1, status: 'active' },
      };
    });
    await registerReportsModule(app);
  });

  afterAll(async () => {
    await app?.close();
    await db('report_executions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('report_definitions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('patients').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('branches').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('users').whereIn('id', [IDS.userA, IDS.userB]).delete();
    await db('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();
    await fs.rm(path.join(reportRoot, 'report-integration'), { recursive: true, force: true });
    await db.destroy();
  });

  it('queues a pending report and executes only records in the authorized branch scope', async () => {
    currentTenant = IDS.tenantA; currentUser = IDS.userA; currentBranches = [IDS.branchA]; currentGrants = allGrants;
    const created = await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { name: 'Branch patient report', queryConfig: { table: 'patients' }, columns: [{ header: 'MRN', accessor: 'medical_record_number' }, { header: 'First name', accessor: 'first_name' }], filters: [], sorting: [], exportFormats: ['csv', 'pdf', 'excel', 'json'] } });
    expect(created.statusCode).toBe(201);
    reportId = created.json().data.id as string;

    const queued = await app.inject({ method: 'POST', url: `/api/v1/reports/${reportId}/execute`, payload: { format: 'csv' } });
    expect(queued.statusCode).toBe(202);
    expect(queued.json().data.status).toBe('pending');
    csvExecutionId = queued.json().data.id as string;
    const pending = await db('report_executions').where({ id: csvExecutionId, tenant_id: IDS.tenantA }).first();
    expect(pending.status).toBe('pending');

    await processPendingReportsOnce();
    const execution = await db('report_executions').where({ id: csvExecutionId, tenant_id: IDS.tenantA }).first();
    expect(execution).toMatchObject({ status: 'completed', row_count: 1, format: 'csv' });
    expect(execution.output_path).toBeTruthy();
    const stored = await fs.readFile(path.join(reportRoot, String(execution.output_path)));
    expect(stored.subarray(0, 18).toString()).toBe('HEALTH_ERP_EXPORT\0');

    const download = await app.inject({ method: 'GET', url: `/api/v1/reports/export/${csvExecutionId}/csv` });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.body).toContain('Alice');
    expect(download.body).not.toContain('Bob');
  });

  it('renders a real PDF artifact and prevents report download when the dedicated permission is missing or tenant differs', async () => {
    const queued = await app.inject({ method: 'POST', url: `/api/v1/reports/${reportId}/execute`, payload: { format: 'pdf' } });
    expect(queued.statusCode).toBe(202);
    const pdfExecutionId = queued.json().data.id as string;
    await processPendingReportsOnce();
    const execution = await db('report_executions').where({ id: pdfExecutionId, tenant_id: IDS.tenantA }).first();
    expect(execution.status, execution.error || 'report execution failed without an error').toBe('completed');
    const pdf = await app.inject({ method: 'GET', url: `/api/v1/reports/export/${pdfExecutionId}/pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    currentGrants = allGrants.filter((grant) => grant.permission !== 'reports.download');
    const denied = await app.inject({ method: 'GET', url: `/api/v1/reports/export/${pdfExecutionId}/pdf` });
    expect(denied.statusCode).toBe(403);
    currentTenant = IDS.tenantB; currentUser = IDS.userB; currentBranches = []; currentGrants = allGrants;
    const foreign = await app.inject({ method: 'GET', url: `/api/v1/reports/export/${pdfExecutionId}/pdf` });
    expect(foreign.statusCode).toBe(404);
    currentTenant = IDS.tenantA; currentUser = IDS.userA; currentBranches = [IDS.branchA];
  });

  it('retains execution history while deleting expired report artifacts', async () => {
    await db('report_executions').where({ id: csvExecutionId, tenant_id: IDS.tenantA }).update({ artifact_expires_at: new Date(Date.now() - 1000) });
    await applyReportRetention(new Date());
    const execution = await db('report_executions').where({ id: csvExecutionId, tenant_id: IDS.tenantA }).first();
    expect(execution.status).toBe('completed');
    expect(execution.artifact_deleted_at).not.toBeNull();
    expect(execution.output_path).toBeNull();
  });
});
