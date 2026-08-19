import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const { registerBillingModule } = await import('../billing/index.js');

const enabled = process.env.RUN_BILLING_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenantA: '91000000-0000-0000-0000-000000000001',
  tenantB: '91000000-0000-0000-0000-000000000002',
  branchA: '92000000-0000-0000-0000-000000000001',
  branchB: '92000000-0000-0000-0000-000000000002',
  patientA: '93000000-0000-0000-0000-000000000001',
  patientB: '93000000-0000-0000-0000-000000000002',
  patientForeign: '93000000-0000-0000-0000-000000000003',
  invoiceA: '94000000-0000-0000-0000-000000000001',
  invoiceB: '94000000-0000-0000-0000-000000000002',
  invoiceForeign: '94000000-0000-0000-0000-000000000003',
  providerPayment: '95000000-0000-0000-0000-000000000001',
  internalPayment: '95000000-0000-0000-0000-000000000002',
};

function principal(grants: Principal['grants'], overrides: Partial<Principal> = {}): Principal {
  return {
    kind: 'user',
    id: 'integration-user',
    tenantId: IDS.tenantA,
    roles: [],
    grants,
    denials: [],
    branches: [IDS.branchA],
    departmentId: null,
    locale: 'en',
    permVersion: 1,
    status: 'active',
    ...overrides,
  };
}

describeDatabase('provider-payment PostgreSQL integration security suite', () => {
  let app: FastifyInstance;
  let currentPrincipal = principal([{ permission: 'billing.view', scope: 'tenant' }]);

  beforeAll(async () => {
    await db.transaction(async (trx) => {
      await trx('payment_transactions').whereIn('id', [IDS.providerPayment, IDS.internalPayment]).delete();
      await trx('invoices').whereIn('id', [IDS.invoiceA, IDS.invoiceB, IDS.invoiceForeign]).delete();
      await trx('patients').whereIn('id', [IDS.patientA, IDS.patientB, IDS.patientForeign]).delete();
      await trx('branches').whereIn('id', [IDS.branchA, IDS.branchB]).delete();
      await trx('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();

      await trx('tenants').insert([
        { id: IDS.tenantA, name: 'Provider Payment Tenant A', slug: 'provider-payment-tenant-a', status: 'active' },
        { id: IDS.tenantB, name: 'Provider Payment Tenant B', slug: 'provider-payment-tenant-b', status: 'active' },
      ]);
      await trx('branches').insert([
        { id: IDS.branchA, tenant_id: IDS.tenantA, name: 'Provider Branch A', code: 'PPA', phone: '0000000001' },
        { id: IDS.branchB, tenant_id: IDS.tenantA, name: 'Provider Branch B', code: 'PPB', phone: '0000000002' },
      ]);
      await trx('patients').insert([
        {
          id: IDS.patientA, tenant_id: IDS.tenantA, medical_record_number: 'PPA-001', first_name: 'Patient', last_name: 'A',
          date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000011', branch_id: IDS.branchA,
        },
        {
          id: IDS.patientB, tenant_id: IDS.tenantA, medical_record_number: 'PPA-002', first_name: 'Patient', last_name: 'B',
          date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000012', branch_id: IDS.branchB,
        },
        {
          id: IDS.patientForeign, tenant_id: IDS.tenantB, medical_record_number: 'PPB-001', first_name: 'Foreign', last_name: 'Patient',
          date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000013',
        },
      ]);
      await trx('invoices').insert([
        {
          id: IDS.invoiceA, tenant_id: IDS.tenantA, patient_id: IDS.patientA, invoice_number: 'PPA-INV-001', items: JSON.stringify([]),
          subtotal: 100, discount: 0, tax: 0, total: 100, paid: 0, due: 100, status: 'pending', due_date: '2030-01-01',
        },
        {
          id: IDS.invoiceB, tenant_id: IDS.tenantA, patient_id: IDS.patientB, invoice_number: 'PPA-INV-002', items: JSON.stringify([]),
          subtotal: 200, discount: 0, tax: 0, total: 200, paid: 0, due: 200, status: 'pending', due_date: '2030-01-01',
        },
        {
          id: IDS.invoiceForeign, tenant_id: IDS.tenantB, patient_id: IDS.patientForeign, invoice_number: 'PPB-INV-001', items: JSON.stringify([]),
          subtotal: 300, discount: 0, tax: 0, total: 300, paid: 0, due: 300, status: 'pending', due_date: '2030-01-01',
        },
      ]);
      await trx('payment_transactions').insert([
        {
          id: IDS.providerPayment, tenant_id: IDS.tenantA, invoice_id: IDS.invoiceA, amount: 100, method: 'fawry',
          provider_key: 'fawry', reference: 'INTEGRATION-FW-001', notes: 'Customer name and phone must not be returned', status: 'pending',
        },
        {
          id: IDS.internalPayment, tenant_id: IDS.tenantA, invoice_id: IDS.invoiceA, amount: 25, method: 'cash',
          provider_key: null, reference: 'INTEGRATION-CASH-001', notes: 'Internal cash payment', status: 'completed',
        },
      ]);
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
    await registerBillingModule(app);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      await db('payment_transactions').whereIn('id', [IDS.providerPayment, IDS.internalPayment]).delete();
      await db('invoices').whereIn('id', [IDS.invoiceA, IDS.invoiceB, IDS.invoiceForeign]).delete();
      await db('patients').whereIn('id', [IDS.patientA, IDS.patientB, IDS.patientForeign]).delete();
      await db('branches').whereIn('id', [IDS.branchA, IDS.branchB]).delete();
      await db('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();
    }
    await db.destroy();
  });

  it('uses the real schema and returns only provider transactions for the tenant', async () => {
    currentPrincipal = principal([{ permission: 'billing.view', scope: 'tenant' }]);
    const response = await app.inject({ method: 'GET', url: `/api/v1/invoices/${IDS.invoiceA}/provider-payments` });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({ providerKey: 'fawry', reference: 'INTEGRATION-FW-001', amount: 100 });
    expect(JSON.stringify(response.json())).not.toContain('Customer name');
    expect(JSON.stringify(response.json())).not.toContain('INTEGRATION-CASH-001');
  });

  it('returns 404 for a cross-tenant invoice and denies a different branch', async () => {
    currentPrincipal = principal([{ permission: 'billing.view', scope: 'tenant' }]);
    const foreign = await app.inject({ method: 'GET', url: `/api/v1/invoices/${IDS.invoiceForeign}/provider-payments` });
    expect(foreign.statusCode).toBe(404);

    currentPrincipal = principal([{ permission: 'billing.view', scope: 'branch' }]);
    const otherBranch = await app.inject({ method: 'GET', url: `/api/v1/invoices/${IDS.invoiceB}/provider-payments` });
    expect(otherBranch.statusCode).toBe(403);
  });

  it('does not expose provider history after invoice soft deletion', async () => {
    await db('invoices').where({ id: IDS.invoiceA, tenant_id: IDS.tenantA }).update({ deleted_at: new Date() });
    currentPrincipal = principal([{ permission: 'billing.view', scope: 'tenant' }]);
    const response = await app.inject({ method: 'GET', url: `/api/v1/invoices/${IDS.invoiceA}/provider-payments` });
    expect(response.statusCode).toBe(404);
    await db('invoices').where({ id: IDS.invoiceA, tenant_id: IDS.tenantA }).update({ deleted_at: null });
  });
});
