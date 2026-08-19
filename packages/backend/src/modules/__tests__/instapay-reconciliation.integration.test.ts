import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const { registerFinancialDeepeningModule } = await import('../financial-deepening/index.js');
const enabled = process.env.RUN_INSTAPAY_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'c1000000-0000-0000-0000-000000000001',
  branch: 'c2000000-0000-0000-0000-000000000001',
  patient: 'c3000000-0000-0000-0000-000000000001',
  user: 'c4000000-0000-0000-0000-000000000001',
  invoice: 'c5000000-0000-0000-0000-000000000001',
  rejectedInvoice: 'c5000000-0000-0000-0000-000000000002',
};

const INSTAPAY_CONFIG = {
  walletIdentifier: 'clinic-wallet-001',
  accountName: 'Clinic Settlement Account',
  referencePrefix: 'CLINIC',
  instructions: 'Transfer the exact amount and include the local reference in the statement note.',
};

function principal(): Principal {
  return {
    kind: 'user', id: IDS.user, tenantId: IDS.tenant, roles: [],
    grants: [
      { permission: 'billing.view', scope: 'tenant' },
      { permission: 'billing.create', scope: 'tenant' },
      { permission: 'billing.verify', scope: 'tenant' },
    ],
    denials: [], branches: [IDS.branch], membership: { branchId: IDS.branch } as Principal['membership'], departmentId: null,
    locale: 'en', permVersion: 1, status: 'active',
  };
}

describeDatabase('manual InstaPay reconciliation PostgreSQL integration suite', () => {
  let app: FastifyInstance;
  const currentPrincipal = principal();

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'instapay-integration-encryption-key';
    await db.transaction(async (trx) => {
      await trx('manual_instapay_reconciliations').where({ tenant_id: IDS.tenant }).delete();
      await trx('payment_transactions').where({ tenant_id: IDS.tenant }).delete();
      await trx('clinic_config_entries').where({ tenant_id: IDS.tenant }).delete();
      await trx('invoices').where({ tenant_id: IDS.tenant }).delete();
      await trx('tenant_provider_connections').where({ tenant_id: IDS.tenant }).delete();
      await trx('patients').where({ tenant_id: IDS.tenant }).delete();
      await trx('users').where({ id: IDS.user }).delete();
      await trx('branches').where({ id: IDS.branch }).delete();
      await trx('tenants').where({ id: IDS.tenant }).delete();

      await trx('tenants').insert({ id: IDS.tenant, name: 'InstaPay Integration Clinic', slug: 'instapay-integration-clinic', status: 'active' });
      await trx('branches').insert({ id: IDS.branch, tenant_id: IDS.tenant, name: 'Main Branch', code: 'MAIN', phone: '0000000020', address: JSON.stringify({ city: 'Giza', street: '18 Clinic Street' }) });
      await trx('users').insert({ id: IDS.user, tenant_id: IDS.tenant, email: 'instapay-integration@example.test', password_hash: 'not-used', first_name: 'Payment', last_name: 'Verifier', branch_id: IDS.branch, status: 'active' });
      await trx('patients').insert({ id: IDS.patient, tenant_id: IDS.tenant, medical_record_number: 'IP-001', first_name: 'Test', last_name: 'Patient', date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000021', national_id: '29001010000001', branch_id: IDS.branch, address: JSON.stringify({ city: 'Giza', street: 'Patient Street' }) });
      for (const [id, number] of [[IDS.invoice, 'INV-IP-001'], [IDS.rejectedInvoice, 'INV-IP-002']] as const) {
        await trx('invoices').insert({ id, tenant_id: IDS.tenant, patient_id: IDS.patient, invoice_number: number, items: JSON.stringify([{ description: 'Consultation', quantity: 1, unitPrice: 100 }]), subtotal: 100, discount: 0, tax: 0, total: 100, paid: 0, due: 100, status: 'pending', due_date: '2026-09-18', created_by: IDS.user });
      }
      await trx('clinic_config_entries').insert({ tenant_id: IDS.tenant, scope_type: 'tenant', scope_id: IDS.tenant, key: 'clinic.finance.currency', value_json: JSON.stringify('EGP'), version: 1, created_by: IDS.user, updated_by: IDS.user });
      await trx('tenant_provider_connections').insert({ tenant_id: IDS.tenant, module_key: 'integrations', provider_key: 'instapay_manual', display_name: 'Clinic InstaPay instructions', environment: 'production', status: 'configured', config_json: JSON.stringify(INSTAPAY_CONFIG), version: 1, last_test_status: 'passed', validation_mode: 'structural', live_validation_enabled: false, validation_timeout_ms: 5000 });
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentPrincipal.tenantId;
      req.ctx = { tenantId: currentPrincipal.tenantId, userId: currentPrincipal.id, roles: currentPrincipal.roles, permissions: currentPrincipal.grants.map((grant) => grant.permission), branches: currentPrincipal.branches, locale: currentPrincipal.locale, requestId: request.id, principal: currentPrincipal };
    });
    await registerFinancialDeepeningModule(app);
  });

  afterAll(async () => {
    if (app) await app.close();
    await db('manual_instapay_reconciliations').where({ tenant_id: IDS.tenant }).delete();
    await db('payment_transactions').where({ tenant_id: IDS.tenant }).delete();
    await db('clinic_config_entries').where({ tenant_id: IDS.tenant }).delete();
    await db('invoices').where({ tenant_id: IDS.tenant }).delete();
    await db('tenant_provider_connections').where({ tenant_id: IDS.tenant }).delete();
    await db('patients').where({ tenant_id: IDS.tenant }).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('branches').where({ id: IDS.branch }).delete();
    await db('tenants').where({ id: IDS.tenant }).delete();
    await db.destroy();
  });

  it('creates an invoice-linked manual request and returns the configured instruction snapshot idempotently', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay', payload: { invoiceId: IDS.invoice, amount: 100 } });
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toMatchObject({ created: true, status: 'awaiting_transfer', localReference: expect.stringMatching(/^CLINIC-/), walletIdentifier: INSTAPAY_CONFIG.walletIdentifier, currency: 'EGP' });

    const second = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay', payload: { invoiceId: IDS.invoice, amount: 100 } });
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toMatchObject({ created: false, id: first.json().data.id, localReference: first.json().data.localReference });
    expect(await db('payment_transactions').where({ tenant_id: IDS.tenant, invoice_id: IDS.invoice })).toHaveLength(1);
  });

  it('requires exact statement amount, settles invoice atomically, and is idempotent on repeat', async () => {
    const request = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay', payload: { invoiceId: IDS.invoice, amount: 100 } });
    const reconciliationId = request.json().data.id;
    const mismatch = await app.inject({ method: 'POST', url: `/api/v1/payments/instapay/${reconciliationId}/reconcile`, payload: { externalReference: 'BANK-001', receivedAmount: 99, transferDate: '2026-08-19', decisionNotes: 'Statement checked' } });
    expect(mismatch.statusCode).toBe(409);
    expect((await db('invoices').where({ id: IDS.invoice }).first()).status).toBe('pending');

    const reconciled = await app.inject({ method: 'POST', url: `/api/v1/payments/instapay/${reconciliationId}/reconcile`, payload: { externalReference: 'BANK-001', receivedAmount: 100, transferDate: '2026-08-19', decisionNotes: 'Statement checked and exact amount matched' } });
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().data).toMatchObject({ status: 'reconciled', externalReference: 'BANK-001', receivedAmount: 100 });
    expect(await db('invoices').where({ id: IDS.invoice }).first()).toMatchObject({ paid: '100.00', due: '0.00', status: 'paid', payment_method: 'wallet' });
    expect(await db('payment_transactions').where({ invoice_id: IDS.invoice }).first()).toMatchObject({ status: 'completed', provider_key: 'instapay_manual', provider_reference: 'BANK-001' });

    const repeated = await app.inject({ method: 'POST', url: `/api/v1/payments/instapay/${reconciliationId}/reconcile`, payload: { externalReference: 'BANK-001', receivedAmount: 100, transferDate: '2026-08-19', decisionNotes: 'Repeated request' } });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().data.idempotent).toBe(true);
    expect((await db('invoices').where({ id: IDS.invoice }).first()).paid).toBe('100.00');
  });

  it('rejects without changing invoice balances and refuses an unauthenticated-style callback mutation', async () => {
    const request = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay', payload: { invoiceId: IDS.rejectedInvoice, amount: 100 } });
    const reconciliationId = request.json().data.id;
    const rejected = await app.inject({ method: 'POST', url: `/api/v1/payments/instapay/${reconciliationId}/reject`, payload: { decisionNotes: 'No matching statement entry found' } });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().data.status).toBe('rejected');
    expect(await db('invoices').where({ id: IDS.rejectedInvoice }).first()).toMatchObject({ paid: '0.00', due: '100.00', status: 'pending' });

    const callback = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay/callback', payload: { reference: 'anything', status: 'completed' } });
    expect(callback.statusCode).toBe(409);
    expect(await db('payment_transactions').where({ tenant_id: IDS.tenant }).where('status', 'completed')).toHaveLength(1);
  });

  it('preserves tenant and permission boundaries', async () => {
    const foreign = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay', payload: { invoiceId: 'c5000000-0000-0000-0000-000000000099', amount: 100 } });
    expect(foreign.statusCode).toBe(404);

    currentPrincipal.grants = [{ permission: 'billing.view', scope: 'tenant' }];
    const forbidden = await app.inject({ method: 'POST', url: '/api/v1/payments/instapay', payload: { invoiceId: IDS.rejectedInvoice, amount: 100 } });
    expect(forbidden.statusCode).toBe(403);
  });
});
