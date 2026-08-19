import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/database.js';
import { errorHandler } from '../../core/error-handler.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const { registerDataExportModule } = await import('../data-export/index.js');
const { buildFhirBundle } = await import('../../services/fhir-export.js');
const {
  applyExportRetention,
  processPendingExportsOnce,
  readExportArtifact,
} = await import('../../services/export-service.js');

const enabled = process.env.RUN_EXPORT_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;
const exportRoot = process.env.EXPORT_LOCAL_DIR || '/tmp/health-erp-export-test';

const IDS = {
  tenantA: 'e3000000-0000-0000-0000-000000000001',
  tenantB: 'e3000000-0000-0000-0000-000000000002',
  userA: 'e3100000-0000-0000-0000-000000000001',
  userB: 'e3100000-0000-0000-0000-000000000002',
  patientA: 'e3200000-0000-0000-0000-000000000001',
  patientB: 'e3200000-0000-0000-0000-000000000002',
  appointment: 'e3300000-0000-0000-0000-000000000001',
  emr: 'e3400000-0000-0000-0000-000000000001',
  labOrder: 'e3500000-0000-0000-0000-000000000001',
  labTest: 'e3600000-0000-0000-0000-000000000001',
  prescription: 'e3700000-0000-0000-0000-000000000001',
  prescriptionItem: 'e3800000-0000-0000-0000-000000000001',
  inventory: 'e3810000-0000-0000-0000-000000000001',
  dispenseRequest: 'e3820000-0000-0000-0000-000000000001',
  dispenseRecord: 'e3830000-0000-0000-0000-000000000001',
  invoice: 'e3900000-0000-0000-0000-000000000001',
  payment: 'e3a00000-0000-0000-0000-000000000001',
};

const grants = [
  { permission: 'data_export.view', scope: 'tenant' as const, effect: 'ALLOW' as const, source: 'user' as const },
  { permission: 'data_export.export', scope: 'tenant' as const, effect: 'ALLOW' as const, source: 'user' as const },
  { permission: 'data_export.download', scope: 'tenant' as const, effect: 'ALLOW' as const, source: 'user' as const },
  { permission: 'data_export.manage', scope: 'tenant' as const, effect: 'ALLOW' as const, source: 'user' as const },
];

describeDatabase('data export PostgreSQL integration suite', () => {
  let app: ReturnType<typeof Fastify>;
  let currentTenant = IDS.tenantA;
  let currentGrants = grants;
  let jobId: string;

  beforeAll(async () => {
    await db.transaction(async (trx) => {
      await trx('export_jobs').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('export_definitions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      if (await trx.schema.hasTable('payment_transactions')) await trx('payment_transactions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      if (await trx.schema.hasTable('invoices')) await trx('invoices').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      if (await trx.schema.hasTable('pharmacy_dispense_records')) await trx('pharmacy_dispense_records').where({ id: IDS.dispenseRecord }).delete();
      if (await trx.schema.hasTable('pharmacy_dispense_requests')) await trx('pharmacy_dispense_requests').where({ id: IDS.dispenseRequest }).delete();
      if (await trx.schema.hasTable('pharmacy_prescription_items')) await trx('pharmacy_prescription_items').where({ prescription_id: IDS.prescription }).delete();
      if (await trx.schema.hasTable('pharmacy_prescriptions')) await trx('pharmacy_prescriptions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      if (await trx.schema.hasTable('pharmacy_inventory')) await trx('pharmacy_inventory').where({ id: IDS.inventory }).delete();
      if (await trx.schema.hasTable('lab_tests')) await trx('lab_tests').where({ id: IDS.labTest }).delete();
      if (await trx.schema.hasTable('lab_orders')) await trx('lab_orders').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      if (await trx.schema.hasTable('emr_records')) await trx('emr_records').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      if (await trx.schema.hasTable('appointments')) await trx('appointments').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('patients').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
      await trx('users').whereIn('id', [IDS.userA, IDS.userB]).delete();
      await trx('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();

      await trx('tenants').insert([
        { id: IDS.tenantA, name: 'Export Tenant A', slug: 'export-tenant-a', locale: 'en', status: 'active' },
        { id: IDS.tenantB, name: 'Export Tenant B', slug: 'export-tenant-b', locale: 'en', status: 'active' },
      ]);
      await trx('users').insert([
        { id: IDS.userA, tenant_id: IDS.tenantA, email: 'export-a@example.test', password_hash: 'test-hash-a', first_name: 'Ada', last_name: 'Export', status: 'active' },
        { id: IDS.userB, tenant_id: IDS.tenantB, email: 'export-b@example.test', password_hash: 'test-hash-b', first_name: 'Ben', last_name: 'Export', status: 'active' },
      ]);
      await trx('patients').insert([
        { id: IDS.patientA, tenant_id: IDS.tenantA, medical_record_number: 'EXP-A-001', first_name: 'Alice', last_name: 'TenantA', date_of_birth: '1980-01-01', gender: 'female', phone: '+10000000001', email: 'alice@example.test', status: 'active', created_by: IDS.userA },
        { id: IDS.patientB, tenant_id: IDS.tenantB, medical_record_number: 'EXP-B-001', first_name: 'Bob', last_name: 'TenantB', date_of_birth: '1981-01-01', gender: 'male', phone: '+10000000002', email: 'bob@example.test', status: 'active', created_by: IDS.userB },
      ]);
      await trx('appointments').insert({ id: IDS.appointment, tenant_id: IDS.tenantA, patient_id: IDS.patientA, doctor_id: IDS.userA, appointment_date: '2026-08-19', start_time: '09:00', end_time: '09:30', duration: 30, type: 'consultation', status: 'scheduled', created_by: IDS.userA });
      await trx('emr_records').insert({ id: IDS.emr, tenant_id: IDS.tenantA, patient_id: IDS.patientA, appointment_id: IDS.appointment, doctor_id: IDS.userA, encounter_date: '2026-08-19', encounter_type: 'consultation', chief_complaint: 'Cough', diagnosis: JSON.stringify([{ code: 'R05', description: 'Cough' }]), vitals: JSON.stringify({ heart_rate: 72, temperature: 37.1 }), status: 'signed', created_by: IDS.userA });
      await trx('lab_orders').insert({ id: IDS.labOrder, tenant_id: IDS.tenantA, patient_id: IDS.patientA, doctor_id: IDS.userA, appointment_id: IDS.appointment, emr_record_id: IDS.emr, order_number: 'LAB-EXP-001', status: 'completed', order_date: '2026-08-19', results_summary: 'Normal', results: JSON.stringify([]), created_by: IDS.userA });
      await trx('lab_tests').insert({ id: IDS.labTest, order_id: IDS.labOrder, test_code: 'HB', test_name: 'Hemoglobin', result_value: '13.2', result_unit: 'g/dL', status: 'completed' });
      await trx('pharmacy_prescriptions').insert({ id: IDS.prescription, tenant_id: IDS.tenantA, patient_id: IDS.patientA, doctor_id: IDS.userA, emr_record_id: IDS.emr, prescription_number: 'RX-EXP-001', status: 'active', created_by: IDS.userA });
      await trx('pharmacy_prescription_items').insert({ id: IDS.prescriptionItem, prescription_id: IDS.prescription, drug_name: 'Example medicine', dosage: '10 mg', route: 'oral', frequency: 'daily', duration: '5 days', quantity: 5, refills: 0, instructions: 'Take once daily' });
      await trx('pharmacy_inventory').insert({ id: IDS.inventory, tenant_id: IDS.tenantA, drug_name: 'Example medicine', stock_quantity: 10, unit_price: 4, batch_number: 'EXP-BATCH', status: 'active' });
      await trx('pharmacy_dispense_requests').insert({ id: IDS.dispenseRequest, tenant_id: IDS.tenantA, prescription_id: IDS.prescription, patient_id: IDS.patientA, idempotency_key: 'export-integration-dispense', status: 'completed', dispensed_by: IDS.userA });
      await trx('pharmacy_dispense_records').insert({ id: IDS.dispenseRecord, tenant_id: IDS.tenantA, request_id: IDS.dispenseRequest, prescription_id: IDS.prescription, prescription_item_id: IDS.prescriptionItem, inventory_id: IDS.inventory, quantity: 1, batch_number: 'EXP-BATCH', dispensed_by: IDS.userA });
      await trx('invoices').insert({ id: IDS.invoice, tenant_id: IDS.tenantA, patient_id: IDS.patientA, appointment_id: IDS.appointment, invoice_number: 'INV-EXP-001', items: JSON.stringify([{ name: 'Consultation', amount: 100 }]), subtotal: 100, total: 100, due: 0, paid: 100, status: 'paid', due_date: '2026-09-19', created_by: IDS.userA });
      await trx('payment_transactions').insert({ id: IDS.payment, tenant_id: IDS.tenantA, invoice_id: IDS.invoice, amount: 100, method: 'cash', status: 'completed' });
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentTenant;
      req.ctx = {
        tenantId: currentTenant, userId: currentTenant === IDS.tenantA ? IDS.userA : IDS.userB, roles: [],
        permissions: currentGrants.map((grant) => grant.permission), branches: [], locale: 'en', requestId: request.id,
        principal: { kind: 'user', id: currentTenant === IDS.tenantA ? IDS.userA : IDS.userB, tenantId: currentTenant, roles: [], grants: currentGrants, denials: [], branches: [], departmentId: null, locale: 'en', permVersion: 1, status: 'active' },
      };
    });
    await registerDataExportModule(app);
  });

  afterAll(async () => {
    await app?.close();
    await db('export_jobs').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('export_definitions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('payment_transactions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('invoices').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('pharmacy_dispense_records').where({ id: IDS.dispenseRecord }).delete();
    await db('pharmacy_dispense_requests').where({ id: IDS.dispenseRequest }).delete();
    await db('pharmacy_prescription_items').where({ prescription_id: IDS.prescription }).delete();
    await db('pharmacy_prescriptions').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('pharmacy_inventory').where({ id: IDS.inventory }).delete();
    await db('lab_tests').where({ id: IDS.labTest }).delete();
    await db('lab_orders').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('emr_records').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('appointments').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('patients').whereIn('tenant_id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('users').whereIn('id', [IDS.userA, IDS.userB]).delete();
    await db('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();
    await fs.rm(path.join(exportRoot, 'export-integration'), { recursive: true, force: true });
    await db.destroy();
  });

  it('creates a real encrypted CSV artifact from selected tenant records', async () => {
    currentTenant = IDS.tenantA;
    currentGrants = grants;
    const queued = await app.inject({ method: 'POST', url: '/api/v1/export/run', payload: { module: 'patients', format: 'csv', filters: { patientId: IDS.patientA }, columns: ['medical_record_number', 'first_name', 'last_name'] } });
    expect(queued.statusCode).toBe(202);
    jobId = queued.json().data.id as string;
    await processPendingExportsOnce();
    const job = await db('export_jobs').where({ id: jobId, tenant_id: IDS.tenantA }).first();
    expect(job).toMatchObject({ status: 'completed', module: 'patients', format: 'csv', record_count: 1 });
    expect(Number(job.file_size)).toBeGreaterThan(0);
    const stored = await fs.readFile(path.join(exportRoot, String(job.file_path)));
    expect(stored.subarray(0, 18).toString()).toBe('HEALTH_ERP_EXPORT\0');
    expect(stored.toString('utf8')).not.toContain('Alice');
    const artifact = await readExportArtifact(job);
    expect(artifact.buffer.toString('utf8')).toContain('Alice');
    expect(artifact.buffer.toString('utf8')).not.toContain('Bob');
  });

  it('maps real records to a tenant-scoped FHIR R4 Bundle without honoring foreign tenant parameters', async () => {
    const bundle = await buildFhirBundle(IDS.tenantA, undefined, { patientId: IDS.patientA }, false);
    const types = new Set(bundle.entry.map((entry) => entry.resource.resourceType));
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.total).toBeGreaterThan(0);
    expect(types).toEqual(new Set(['Organization', 'Practitioner', 'Patient', 'Appointment', 'Encounter', 'Observation', 'MedicationRequest', 'MedicationDispense', 'DiagnosticReport', 'Invoice', 'PaymentReconciliation']));
    expect(JSON.stringify(bundle)).toContain('Alice');
    expect(JSON.stringify(bundle)).not.toContain('Bob');

    const response = await app.inject({ method: 'GET', url: `/api/v1/export/fhir/Patient?tenantSlug=export-tenant-b&patientId=${IDS.patientA}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().resourceType).toBe('Bundle');
    expect(JSON.stringify(response.json())).toContain('Alice');
    expect(JSON.stringify(response.json())).not.toContain('Bob');
  });

  it('requires the dedicated download permission and enforces tenant ownership at download time', async () => {
    currentTenant = IDS.tenantB;
    currentGrants = grants;
    const foreign = await app.inject({ method: 'GET', url: `/api/v1/export/download/${jobId}` });
    expect(foreign.statusCode).toBe(404);

    currentTenant = IDS.tenantA;
    currentGrants = grants.filter((grant) => grant.permission !== 'data_export.download');
    const denied = await app.inject({ method: 'GET', url: `/api/v1/export/download/${jobId}` });
    expect(denied.statusCode).toBe(403);

    currentGrants = grants;
    const download = await app.inject({ method: 'GET', url: `/api/v1/export/download/${jobId}` });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.body).toContain('Alice');
  });

  it('deletes expired artifacts while preserving the export audit row', async () => {
    await db('export_jobs').where({ id: jobId, tenant_id: IDS.tenantA }).update({ artifact_expires_at: new Date(Date.now() - 1000) });
    await applyExportRetention(new Date());
    const job = await db('export_jobs').where({ id: jobId, tenant_id: IDS.tenantA }).first();
    expect(job).toMatchObject({ status: 'completed' });
    expect(job.artifact_deleted_at).not.toBeNull();
    expect(job.file_path).toBeNull();
    await expect(fs.access(path.join(exportRoot, String(job.file_path || 'missing')))).rejects.toThrow();
  });
});
