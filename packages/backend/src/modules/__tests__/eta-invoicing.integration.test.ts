import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encryptField, hashString } from '@healthcare/shared/utils';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';

vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const { registerFinancialDeepeningModule } = await import('../financial-deepening/index.js');
const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_ETA_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'b1000000-0000-0000-0000-000000000001',
  branch: 'b2000000-0000-0000-0000-000000000001',
  patient: 'b3000000-0000-0000-0000-000000000001',
  user: 'b4000000-0000-0000-0000-000000000001',
  invoice: 'b5000000-0000-0000-0000-000000000001',
};

const ETA_CONFIG = {
  taxRegistrationNumber: '123456789',
  invoiceSeries: 'CLINIC',
  activityCode: '8610',
  identityEndpointUrl: 'https://id.preprod.eta.gov.eg',
  systemApiEndpointUrl: 'https://api.preprod.invoicing.eta.gov.eg',
  documentTypeId: '1',
  documentTypeVersionId: '2',
  issuerBranchCode: '0',
  currencyCode: 'EGP',
  taxTypeCode: 'T1',
  taxRate: 14,
  taxCalculationMode: 'exclusive',
};

function principal(): Principal {
  return {
    kind: 'user', id: IDS.user, tenantId: IDS.tenant, roles: [],
    grants: [
      { permission: 'eta_invoicing.view', scope: 'tenant' },
      { permission: 'eta_invoicing.create', scope: 'tenant' },
      { permission: 'eta_invoicing.manage', scope: 'tenant' },
      { permission: 'billing.view', scope: 'tenant' },
    ],
    denials: [], branches: [IDS.branch], membership: { branchId: IDS.branch } as Principal['membership'], departmentId: null,
    locale: 'en', permVersion: 1, status: 'active',
  };
}

describeDatabase('ETA e-invoicing PostgreSQL integration suite', () => {
  let app: FastifyInstance;
  let certificate = '';
  let privateKey = '';
  let signingDirectory = '';
  const currentPrincipal = principal();
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'eta-integration-encryption-key';
    signingDirectory = await mkdtemp(join(tmpdir(), 'health-erp-eta-test-'));
    const keyPath = join(signingDirectory, 'key.pem');
    const certPath = join(signingDirectory, 'cert.pem');
    await execFileAsync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-days', '2', '-nodes', '-subj', '/CN=123456789'], { timeout: 30_000 });
    certificate = await readFile(certPath, 'utf8');
    privateKey = await readFile(keyPath, 'utf8');

    await db.transaction(async (trx) => {
      await trx('eta_notification_deliveries').where({ tenant_id: IDS.tenant }).delete();
      await trx('eta_invoices').where({ tenant_id: IDS.tenant }).delete();
      await trx('invoices').where({ tenant_id: IDS.tenant }).delete();
      await trx('clinic_integration_secrets').where({ tenant_id: IDS.tenant }).delete();
      await trx('tenant_module_configurations').where({ tenant_id: IDS.tenant }).delete();
      await trx('tenant_provider_connections').where({ tenant_id: IDS.tenant }).delete();
      await trx('tenant_regional_profiles').where({ tenant_id: IDS.tenant }).delete();
      await trx('patients').where({ tenant_id: IDS.tenant }).delete();
      await trx('users').where({ id: IDS.user }).delete();
      await trx('branches').where({ id: IDS.branch }).delete();
      await trx('tenants').where({ id: IDS.tenant }).delete();

      await trx('tenants').insert({ id: IDS.tenant, name: 'ETA Integration Clinic', slug: 'eta-integration-clinic', status: 'active' });
      await trx('branches').insert({ id: IDS.branch, tenant_id: IDS.tenant, name: 'ETA Main Branch', code: '0', phone: '0000000010', address: JSON.stringify({ city: 'Giza', street: '17 Clinic Street' }) });
      await trx('users').insert({ id: IDS.user, tenant_id: IDS.tenant, email: 'eta-integration@example.test', password_hash: 'not-used', first_name: 'ETA', last_name: 'Tester', branch_id: IDS.branch, status: 'active' });
      await trx('patients').insert({ id: IDS.patient, tenant_id: IDS.tenant, medical_record_number: 'ETA-001', first_name: 'Test', last_name: 'Patient', date_of_birth: '1990-01-01', gender: 'unknown', phone: '0000000011', national_id: '29001010000000', branch_id: IDS.branch, address: JSON.stringify({ city: 'Giza', street: 'Patient Street' }) });
      await trx('invoices').insert({ id: IDS.invoice, tenant_id: IDS.tenant, patient_id: IDS.patient, invoice_number: 'INV-ETA-001', items: JSON.stringify([{ description: 'Consultation', itemCode: 'EGS-CONSULT', itemType: 'EGS', unitType: 'EA', quantity: 1, unitPrice: 100 }]), subtotal: 100, discount: 0, tax: 14, total: 114, paid: 0, due: 114, status: 'issued', due_date: '2026-09-18', created_by: IDS.user });
      await trx('tenant_regional_profiles').insert({ tenant_id: IDS.tenant, country_code: 'EG', profile_key: 'egypt', status: 'configured', national_identifier_policy: 'egyptian_national_id', phone_policy: 'egypt_local', tax_profile_key: 'eta_vat', metadata_json: JSON.stringify({}), version: 1, configured_by: IDS.user });
      await trx('tenant_provider_connections').insert({ tenant_id: IDS.tenant, module_key: 'integrations', provider_key: 'eta', display_name: 'ETA PreProd', environment: 'sandbox', status: 'configured', config_json: JSON.stringify(ETA_CONFIG), version: 1, last_test_status: 'passed', validation_mode: 'structural', live_validation_enabled: false, validation_timeout_ms: 5000 });
      await trx('tenant_module_configurations').insert({ tenant_id: IDS.tenant, module_key: 'eta', config_json: JSON.stringify(ETA_CONFIG), schema_version: 1, version: 1, last_validation_status: 'valid', last_validation_errors: JSON.stringify([]), updated_by: IDS.user });
      const secrets = [
        ['clientId', 'eta-client'], ['clientSecret', 'eta-secret'], ['signingCertificate', certificate], ['signingPrivateKey', privateKey], ['notificationApiKey', 'eta-notification-key'],
      ] as const;
      for (const [secretKey, value] of secrets) {
        await trx('clinic_integration_secrets').insert({ tenant_id: IDS.tenant, provider: 'eta', secret_key: secretKey, encrypted_value: encryptField(value), value_hash: hashString(value), last_four: value.slice(-4), connection_id: (await trx('tenant_provider_connections').where({ tenant_id: IDS.tenant, provider_key: 'eta' }).first()).id, secret_version: 1, is_active: true });
      }
    });

    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/connect/token')) return new Response(JSON.stringify({ access_token: 'eta-test-token', token_type: 'Bearer', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/documenttypes/1/versions/2')) return new Response(JSON.stringify({ typeName: 'i', name: '1.0', status: 'published', jsonSchema: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/documentsubmissions/')) return new Response(JSON.stringify({ submissionUUID: 'SUB-ETA-001', acceptedDocuments: [{ uuid: 'DOC-ETA-001', longId: 'LONG-ETA-001', internalId: 'CLINIC-INV-ETA-001' }], rejectedDocuments: [] }), { status: 202, headers: { 'content-type': 'application/json' } });
      if (url.includes('/documentsubmissions/SUB-ETA-001')) return new Response(JSON.stringify({ uuid: 'SUB-ETA-001', overallStatus: 'valid', documentSummary: [{ uuid: 'DOC-ETA-001', longId: 'LONG-ETA-001', internalId: 'CLINIC-INV-ETA-001', status: 'valid' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      throw new Error(`Unexpected ETA test URL: ${url} ${init?.method || 'GET'}`);
    }) as typeof fetch;

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
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    await db('eta_notification_deliveries').where({ tenant_id: IDS.tenant }).delete();
    await db('eta_invoices').where({ tenant_id: IDS.tenant }).delete();
    await db('invoices').where({ tenant_id: IDS.tenant }).delete();
    await db('clinic_integration_secrets').where({ tenant_id: IDS.tenant }).delete();
    await db('tenant_module_configurations').where({ tenant_id: IDS.tenant }).delete();
    await db('tenant_provider_connections').where({ tenant_id: IDS.tenant }).delete();
    await db('tenant_regional_profiles').where({ tenant_id: IDS.tenant }).delete();
    await db('patients').where({ tenant_id: IDS.tenant }).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('branches').where({ id: IDS.branch }).delete();
    await db('tenants').where({ id: IDS.tenant }).delete();
    await db.destroy();
    if (signingDirectory) await rm(signingDirectory, { recursive: true, force: true });
  });

  it('generates a real configured draft, signs and submits it idempotently, then refreshes ETA status', async () => {
    const generated = await app.inject({ method: 'POST', url: '/api/v1/eta/invoices/generate', payload: { invoiceId: IDS.invoice, documentType: 'I' } });
    expect(generated.statusCode).toBe(201);
    expect(generated.json().data).toMatchObject({ status: 'draft', document_type_version: '1.0', document_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.parse(generated.json().data.eta_json)).toMatchObject({ taxpayerActivityCode: '8610', totalAmount: 114, signatures: [] });

    const submitted = await app.inject({ method: 'POST', url: `/api/v1/eta/invoices/${generated.json().data.id}/submit` });
    expect(submitted.statusCode).toBe(202);
    expect(submitted.json().data).toMatchObject({ status: 'submitted', submission_uuid: 'SUB-ETA-001', eta_uuid: 'DOC-ETA-001', request_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.parse(submitted.json().data.eta_json).signatures[0]).toMatchObject({ type: 'I', value: expect.any(String) });

    const refreshed = await app.inject({ method: 'GET', url: `/api/v1/eta/invoices/${generated.json().data.id}/status` });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data).toMatchObject({ status: 'approved', eta_uuid: 'DOC-ETA-001' });

    const duplicate = await app.inject({ method: 'POST', url: `/api/v1/eta/invoices/${generated.json().data.id}/submit` });
    expect(duplicate.statusCode).toBe(202);
    expect((globalThis.fetch as any).mock.calls.filter((call: any[]) => String(call[0]).endsWith('/documentsubmissions/'))).toHaveLength(1);
  });

  it('is idempotent for signed ETA callbacks and never accepts an unknown callback key', async () => {
    const rejected = await app.inject({ method: 'PUT', url: '/api/v1/eta/notifications/documents', headers: { authorization: 'ApiKey wrong-key' }, payload: { deliveryId: 'DELIVERY-WRONG', type: 'document', message: [] } });
    expect(rejected.statusCode).toBe(401);

    const first = await app.inject({ method: 'PUT', url: '/api/v1/eta/notifications/documents', headers: { authorization: 'ApiKey eta-notification-key' }, payload: { deliveryId: 'DELIVERY-1', type: 'document', message: [{ type: 'document-validated', uuid: 'DOC-ETA-001', submissionUUID: 'SUB-ETA-001', status: 'Valid' }] } });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toEqual({ accepted: true });
    expect(await db('eta_notification_deliveries').where({ tenant_id: IDS.tenant, delivery_id: 'DELIVERY-1' })).toHaveLength(1);
    expect(await db('eta_invoices').where({ tenant_id: IDS.tenant, internal_id: 'CLINIC-INV-ETA-001' }).first()).toMatchObject({ status: 'approved', eta_uuid: 'DOC-ETA-001' });

    const second = await app.inject({ method: 'PUT', url: '/api/v1/eta/notifications/documents', headers: { authorization: 'ApiKey eta-notification-key' }, payload: { deliveryId: 'DELIVERY-1', type: 'document', message: [{ type: 'document-validated', uuid: 'DOC-ETA-001', submissionUUID: 'SUB-ETA-001', status: 'Valid' }] } });
    expect(second.statusCode).toBe(200);
    expect(await db('eta_notification_deliveries').where({ tenant_id: IDS.tenant, delivery_id: 'DELIVERY-1' })).toHaveLength(1);
  });

  it('preserves tenant and permission boundaries for ETA operations', async () => {
    const foreignId = 'b5000000-0000-0000-0000-000000000099';
    const foreignResponse = await app.inject({ method: 'POST', url: `/api/v1/eta/invoices/${foreignId}/submit` });
    expect(foreignResponse.statusCode).toBe(404);

    currentPrincipal.grants = [{ permission: 'eta_invoicing.view', scope: 'tenant' }];
    const forbidden = await app.inject({ method: 'POST', url: '/api/v1/eta/invoices/generate', payload: { invoiceId: IDS.invoice, documentType: 'I' } });
    expect(forbidden.statusCode).toBe(403);
  });
});
