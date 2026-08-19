import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptField, hashString } from '@healthcare/shared/utils';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';

const { stripeBalanceRetrieve } = vi.hoisted(() => ({ stripeBalanceRetrieve: vi.fn() }));
vi.mock('stripe', () => ({
  default: class MockStripe {
    balance = { retrieve: stripeBalanceRetrieve };
  },
}));
vi.mock('twilio', () => ({ default: vi.fn() }));
vi.mock('../../services/clinic-modules.js', () => ({ enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined) }));

const { registerClinicSettingsModule } = await import('../clinic-settings/index.js');

const enabled = process.env.RUN_PROVIDER_VERIFICATION_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'c1000000-0000-0000-0000-000000000001',
  branch: 'c2000000-0000-0000-0000-000000000001',
  user: 'c3000000-0000-0000-0000-000000000001',
  stripeConnection: 'c4000000-0000-0000-0000-000000000001',
  manualConnection: 'c4000000-0000-0000-0000-000000000002',
};

function principal(): Principal {
  return {
    kind: 'user', id: IDS.user, tenantId: IDS.tenant, roles: [],
    grants: [
      { permission: 'settings.view', scope: 'tenant' },
      { permission: 'settings.manage', scope: 'tenant' },
    ],
    denials: [], branches: [IDS.branch], membership: { branchId: IDS.branch } as Principal['membership'], departmentId: null,
    locale: 'en', permVersion: 1, status: 'active',
  };
}

describeDatabase('Provider verification PostgreSQL integration suite', () => {
  let app: FastifyInstance;
  const currentPrincipal = principal();

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'provider-verification-integration-key';
    stripeBalanceRetrieve.mockResolvedValue({ livemode: false, available: [{ currency: 'egp' }] });

    await db.transaction(async (trx) => {
      await trx('provider_verification_runs').where({ tenant_id: IDS.tenant }).delete();
      await trx('clinic_integration_secrets').where({ tenant_id: IDS.tenant }).delete();
      await trx('tenant_provider_connections').where({ tenant_id: IDS.tenant }).delete();
      await trx('tenant_regional_profiles').where({ tenant_id: IDS.tenant }).delete();
      await trx('users').where({ id: IDS.user }).delete();
      await trx('branches').where({ id: IDS.branch }).delete();
      await trx('tenants').where({ id: IDS.tenant }).delete();

      await trx('tenants').insert({ id: IDS.tenant, name: 'Provider Verification Clinic', slug: 'provider-verification-clinic', status: 'active' });
      await trx('branches').insert({ id: IDS.branch, tenant_id: IDS.tenant, name: 'Main Branch', code: 'PV-01', phone: '0000000030', address: JSON.stringify({ city: 'Giza' }) });
      await trx('users').insert({ id: IDS.user, tenant_id: IDS.tenant, email: 'provider-verification@example.test', password_hash: 'not-used', first_name: 'Provider', last_name: 'Verifier', branch_id: IDS.branch, status: 'active' });
      await trx('tenant_provider_connections').insert([
        { id: IDS.stripeConnection, tenant_id: IDS.tenant, module_key: 'integrations', provider_key: 'stripe', environment: 'sandbox', status: 'configured', config_json: JSON.stringify({ currency: 'EGP' }), version: 1, last_test_status: 'passed', validation_mode: 'structural', live_validation_enabled: false, validation_timeout_ms: 5000 },
        { id: IDS.manualConnection, tenant_id: IDS.tenant, module_key: 'integrations', provider_key: 'instapay_manual', environment: 'sandbox', status: 'configured', config_json: JSON.stringify({ walletIdentifier: 'clinic@instapay', accountName: 'Provider Verification Clinic', referencePrefix: 'IP', instructions: 'Use the clinic wallet and provide the transfer reference.' }), version: 1, last_test_status: 'passed', validation_mode: 'structural', live_validation_enabled: false, validation_timeout_ms: 5000 },
      ]);
      const stripeSecret = 'sk_test_provider_verification';
      await trx('clinic_integration_secrets').insert({ tenant_id: IDS.tenant, provider: 'stripe', secret_key: 'secretKey', encrypted_value: encryptField(stripeSecret), value_hash: hashString(stripeSecret), last_four: stripeSecret.slice(-4), connection_id: IDS.stripeConnection, secret_version: 1, is_active: true });
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentPrincipal.tenantId;
      req.ctx = { tenantId: currentPrincipal.tenantId, userId: currentPrincipal.id, roles: currentPrincipal.roles, permissions: currentPrincipal.grants.map((grant) => grant.permission), branches: currentPrincipal.branches, locale: currentPrincipal.locale, requestId: request.id, principal: currentPrincipal };
    });
    await registerClinicSettingsModule(app);
  });

  afterAll(async () => {
    if (app) await app.close();
    await db('provider_verification_runs').where({ tenant_id: IDS.tenant }).delete();
    await db('clinic_integration_secrets').where({ tenant_id: IDS.tenant }).delete();
    await db('tenant_provider_connections').where({ tenant_id: IDS.tenant }).delete();
    await db('tenant_regional_profiles').where({ tenant_id: IDS.tenant }).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('branches').where({ id: IDS.branch }).delete();
    await db('tenants').where({ id: IDS.tenant }).delete();
    await db.destroy();
  });

  it('authenticates Stripe sandbox credentials once and replays the durable idempotent result', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/clinic-providers/stripe/verify', payload: { verificationType: 'sandbox_authentication', idempotencyKey: 'stripe-sandbox-fixed-001' } });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ status: 'passed', resultCode: 'stripe_account_authenticated', providerKey: 'stripe', environment: 'sandbox' });
    const second = await app.inject({ method: 'POST', url: '/api/v1/clinic-providers/stripe/verify', payload: { verificationType: 'sandbox_authentication', idempotencyKey: 'stripe-sandbox-fixed-001' } });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(stripeBalanceRetrieve).toHaveBeenCalledTimes(1);
    expect(await db('provider_verification_runs').where({ tenant_id: IDS.tenant, provider_key: 'stripe', status: 'passed' })).toHaveLength(1);
  });

  it('fails closed for production-mode mismatch and never verifies manual InstaPay externally', async () => {
    await db('tenant_provider_connections').where({ id: IDS.stripeConnection, tenant_id: IDS.tenant }).update({ environment: 'production' });
    const mismatch = await app.inject({ method: 'POST', url: '/api/v1/clinic-providers/stripe/verify', payload: { verificationType: 'account_authentication', idempotencyKey: 'stripe-production-mismatch-001' } });
    expect(mismatch.statusCode).toBe(200);
    expect(mismatch.json().data).toMatchObject({ status: 'failed', resultCode: 'stripe_environment_mismatch', environment: 'production' });

    const manual = await app.inject({ method: 'POST', url: '/api/v1/clinic-providers/instapay_manual/verify', payload: { verificationType: 'sandbox_readiness', idempotencyKey: 'manual-no-external-001' } });
    expect(manual.statusCode).toBe(200);
    expect(manual.json().data).toMatchObject({ status: 'not_supported', resultCode: 'manual_provider_verification_not_supported' });
  });

  it('enforces settings permission boundaries and tenant-scoped verification history', async () => {
    currentPrincipal.grants = [{ permission: 'settings.view', scope: 'tenant' }];
    const forbidden = await app.inject({ method: 'POST', url: '/api/v1/clinic-providers/stripe/verify', payload: { verificationType: 'account_authentication', idempotencyKey: 'forbidden-verify-001' } });
    expect(forbidden.statusCode).toBe(403);

    const history = await app.inject({ method: 'GET', url: '/api/v1/clinic-providers/stripe/verifications' });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ providerKey: 'stripe', tenantId: IDS.tenant })]));
  });
});
