import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const { registerPharmacyModule } = await import('../pharmacy/index.js');

const enabled = process.env.RUN_PHARMACY_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'a1000000-0000-0000-0000-000000000001',
  branch: 'a2000000-0000-0000-0000-000000000001',
  patient: 'a3000000-0000-0000-0000-000000000001',
  allergyPatient: 'a3000000-0000-0000-0000-000000000002',
  user: 'a4000000-0000-0000-0000-000000000001',
  inventory: 'a5000000-0000-0000-0000-000000000001',
  medication: 'a6000000-0000-0000-0000-000000000001',
};

function principal(): Principal {
  return {
    kind: 'user',
    id: IDS.user,
    tenantId: IDS.tenant,
    roles: [],
    grants: [
      { permission: 'pharmacy.view', scope: 'tenant' },
      { permission: 'pharmacy.prescribe', scope: 'tenant' },
      { permission: 'pharmacy.dispense', scope: 'tenant' },
      { permission: 'pharmacy.override', scope: 'tenant' },
      { permission: 'patients.view', scope: 'tenant' },
    ],
    denials: [],
    branches: [IDS.branch],
    membership: { branchId: IDS.branch } as Principal['membership'],
    departmentId: null,
    locale: 'en',
    permVersion: 1,
    status: 'active',
  };
}

describeDatabase('pharmacy clinical-safety PostgreSQL integration suite', () => {
  let app: FastifyInstance;
  const currentPrincipal = principal();

  beforeAll(async () => {
    await db.transaction(async (trx) => {
      await trx('pharmacy_dispense_records').where({ tenant_id: IDS.tenant }).delete();
      await trx('pharmacy_dispense_requests').where({ tenant_id: IDS.tenant }).delete();
      await trx('pharmacy_prescriptions').where({ tenant_id: IDS.tenant }).delete();
      await trx('patient_allergies').where({ tenant_id: IDS.tenant }).delete();
      await trx('patient_medications').where({ tenant_id: IDS.tenant }).delete();
      await trx('pharmacy_inventory').where({ tenant_id: IDS.tenant }).delete();
      await trx('medication_database').where({ id: IDS.medication }).delete();
      await trx('patients').where({ tenant_id: IDS.tenant }).delete();
      await trx('users').where({ id: IDS.user }).delete();
      await trx('branches').where({ id: IDS.branch }).delete();
      await trx('tenants').where({ id: IDS.tenant }).delete();

      await trx('tenants').insert({ id: IDS.tenant, name: 'Pharmacy Safety Tenant', slug: 'pharmacy-safety-tenant', status: 'active' });
      await trx('branches').insert({ id: IDS.branch, tenant_id: IDS.tenant, name: 'Pharmacy Branch', code: 'PHARM', phone: '0000000010' });
      await trx('users').insert({
        id: IDS.user, tenant_id: IDS.tenant, email: 'pharmacy-safety@example.test', password_hash: 'not-used',
        first_name: 'Pharmacy', last_name: 'Tester', branch_id: IDS.branch, status: 'active',
      });
      await trx('patients').insert([
        { id: IDS.patient, tenant_id: IDS.tenant, medical_record_number: 'PHARM-001', first_name: 'Patient', last_name: 'Safe', date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000011', branch_id: IDS.branch },
        { id: IDS.allergyPatient, tenant_id: IDS.tenant, medical_record_number: 'PHARM-002', first_name: 'Patient', last_name: 'Allergy', date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000012', branch_id: IDS.branch },
      ]);
      await trx('medication_database').insert({ id: IDS.medication, generic_name: 'Integration Drug', brand_names: 'Integration Brand', category: 'Test', route: 'oral', dosage_form: 'tablet', strength: '10mg', interactions: null, status: 'active' });
      await trx('pharmacy_inventory').insert({
        id: IDS.inventory, tenant_id: IDS.tenant, branch_id: IDS.branch, drug_name: 'Integration Drug', generic_name: 'Integration Drug',
        stock_quantity: 5, reorder_level: 1, unit_price: 2, batch_number: 'BATCH-001', expiry_date: '2035-01-01', status: 'active',
      });
      await trx('patient_allergies').insert({ tenant_id: IDS.tenant, patient_id: IDS.allergyPatient, allergen: 'Integration Drug', severity: 'anaphylaxis', reaction: 'Anaphylaxis', recorded_by: IDS.user });
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentPrincipal.tenantId;
      req.ctx = {
        tenantId: currentPrincipal.tenantId,
        userId: currentPrincipal.id,
        roles: currentPrincipal.roles,
        permissions: currentPrincipal.grants.map((grant) => grant.permission),
        branches: currentPrincipal.branches,
        locale: currentPrincipal.locale,
        requestId: request.id,
        principal: currentPrincipal,
      };
    });
    await registerPharmacyModule(app);
  });

  afterAll(async () => {
    if (app) await app.close();
    await db('pharmacy_dispense_records').where({ tenant_id: IDS.tenant }).delete();
    await db('pharmacy_dispense_requests').where({ tenant_id: IDS.tenant }).delete();
    await db('pharmacy_prescriptions').where({ tenant_id: IDS.tenant }).delete();
    await db('patient_allergies').where({ tenant_id: IDS.tenant }).delete();
    await db('pharmacy_inventory').where({ tenant_id: IDS.tenant }).delete();
    await db('medication_database').where({ id: IDS.medication }).delete();
    await db('patients').where({ tenant_id: IDS.tenant }).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('branches').where({ id: IDS.branch }).delete();
    await db('tenants').where({ id: IDS.tenant }).delete();
    await db.destroy();
  });

  it('rejects an allergy conflict before creating a prescription', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/pharmacy/prescriptions',
      payload: {
        patientId: IDS.allergyPatient,
        items: [{ drugName: 'Integration Drug', dosage: '10mg', route: 'oral', frequency: 'once daily', duration: '7 days', quantity: 7 }],
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PHARMACY_CLINICAL_WARNING' });
    expect(response.json().warnings[0]).toMatchObject({ code: 'ALLERGY_CONFLICT', severity: 'critical' });
    expect(await db('pharmacy_prescriptions').where({ tenant_id: IDS.tenant, patient_id: IDS.allergyPatient })).toHaveLength(0);
  });

  it('creates and dispenses through a real transaction with lot history and idempotent retry', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/pharmacy/prescriptions',
      payload: {
        patientId: IDS.patient,
        items: [{ drugName: 'Integration Drug', dosage: '10mg', route: 'oral', frequency: 'once daily', duration: '2 days', quantity: 2 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const prescriptionId = created.json().data.id as string;
    const item = await db('pharmacy_prescription_items').where({ prescription_id: prescriptionId }).first();

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/pharmacy/prescriptions/${prescriptionId}/dispense`,
      payload: { idempotencyKey: 'pharmacy-integration-key-1', items: [] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ idempotent: false, status: 'dispensed' });

    const stockAfterFirst = await db('pharmacy_inventory').where({ id: IDS.inventory }).first();
    const itemAfterFirst = await db('pharmacy_prescription_items').where({ id: item.id }).first();
    expect(Number(stockAfterFirst.stock_quantity)).toBe(3);
    expect(Number(itemAfterFirst.quantity_dispensed)).toBe(2);
    expect(await db('pharmacy_dispense_records').where({ prescription_id: prescriptionId })).toHaveLength(1);

    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/pharmacy/prescriptions/${prescriptionId}/dispense`,
      payload: { idempotencyKey: 'pharmacy-integration-key-1', items: [] },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toMatchObject({ idempotent: true, status: 'completed' });
    expect(Number((await db('pharmacy_inventory').where({ id: IDS.inventory }).first()).stock_quantity)).toBe(3);
    expect(await db('pharmacy_dispense_records').where({ prescription_id: prescriptionId })).toHaveLength(1);
  });

  it('rejects a dispense that exceeds available stock without changing inventory', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/pharmacy/prescriptions',
      payload: {
        patientId: IDS.patient,
        items: [{ drugName: 'Integration Drug', dosage: '10mg', route: 'oral', frequency: 'once daily', duration: '20 days', quantity: 20 }],
      },
    });
    const prescriptionId = created.json().data.id as string;
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/pharmacy/prescriptions/${prescriptionId}/dispense`,
      payload: { idempotencyKey: 'pharmacy-integration-key-2', items: [] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('CONFLICT');
    expect(Number((await db('pharmacy_inventory').where({ id: IDS.inventory }).first()).stock_quantity)).toBe(3);
    expect(await db('pharmacy_dispense_records').where({ prescription_id: prescriptionId })).toHaveLength(0);
  });
});
