import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, runtimeMock, structuralMock, etaAuthMock, stripeFactoryMock, twilioFactoryMock, auditMock } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  runtimeMock: vi.fn(),
  structuralMock: vi.fn(),
  etaAuthMock: vi.fn(),
  stripeFactoryMock: vi.fn(),
  twilioFactoryMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('../../core/database.js', () => ({ db: dbMock }));
vi.mock('../clinic-provider-runtime.js', () => ({ getTenantProviderRuntime: runtimeMock }));
vi.mock('../clinic-provider-adapters.js', () => ({ validateClinicProviderAdapter: structuralMock }));
vi.mock('../eta-invoice-service.js', () => ({ verifyEtaOAuthAuthentication: etaAuthMock }));
vi.mock('../audit.js', () => ({ logAudit: auditMock }));
vi.mock('stripe', () => ({ default: stripeFactoryMock }));
vi.mock('twilio', () => ({ default: twilioFactoryMock }));

const { runProviderVerification } = await import('../provider-verification.js');

function queryBuilder(firstRow: unknown = undefined, returningRows: unknown[] = []) {
  const query: Record<string, any> = {};
  const chain = () => query;
  for (const method of ['where', 'andWhere', 'select', 'orderBy', 'limit', 'onConflict']) query[method] = vi.fn(chain);
  query.first = vi.fn().mockResolvedValue(firstRow);
  query.insert = vi.fn((payload: Record<string, unknown>) => { query.insertPayload = payload; return query; });
  query.ignore = vi.fn(() => query);
  query.update = vi.fn((payload: Record<string, unknown>) => {
    query.updated = true;
    query.updatedRow = { ...(returningRows[0] as Record<string, unknown>), ...(query.insertPayload || {}), ...payload, id: (returningRows[0] as any)?.id || 'run-test', tenant_id: (query.insertPayload as any)?.tenant_id || 'tenant-a', provider_key: (query.insertPayload as any)?.provider_key || (returningRows[0] as any)?.provider_key || 'stripe', environment: (query.insertPayload as any)?.environment || 'sandbox', verification_type: (query.insertPayload as any)?.verification_type || (returningRows[0] as any)?.verification_type || 'sandbox_authentication', idempotency_key: (query.insertPayload as any)?.idempotency_key || 'fixed-key', evidence_json: typeof payload.evidence_json === 'string' ? JSON.parse(payload.evidence_json) : payload.evidence_json || {} };
    return query;
  });
  query.returning = vi.fn().mockImplementation(async () => [query.updatedRow || { ...(returningRows[0] as Record<string, unknown>), ...(query.insertPayload || {}) }]);
  return query;
}

const runtime = {
  providerKey: 'stripe', environment: 'sandbox', status: 'configured', validationMode: 'structural', liveValidationEnabled: false,
  validationTimeoutMs: 1000, config: {}, secrets: { secretKey: 'sk_test_123' },
};

function createdRun(providerKey: string, type: string, status: string = 'queued') {
  return {
    id: `run-${providerKey}-${type}`, tenant_id: 'tenant-a', provider_connection_id: 'connection-a', provider_key: providerKey,
    environment: 'sandbox', verification_type: type, idempotency_key: 'fixed-key', status, result_code: null,
    message: null, evidence_json: {}, actor_id: 'user-a', request_id: 'request-a', started_at: null, completed_at: null,
    expires_at: null, created_at: new Date(), updated_at: new Date(),
  };
}

beforeEach(() => {
  dbMock.mockReset(); runtimeMock.mockReset(); structuralMock.mockReset(); etaAuthMock.mockReset(); stripeFactoryMock.mockReset(); twilioFactoryMock.mockReset(); auditMock.mockReset();
  runtimeMock.mockResolvedValue(runtime);
  structuralMock.mockResolvedValue({ status: 'ready', code: 'fawry_configuration_valid', message: 'ready', missing: [], testMode: 'structural' });
  etaAuthMock.mockResolvedValue({ status: 'passed', resultCode: 'eta_oauth_authenticated', message: 'authenticated', evidence: { documentSubmissionPerformed: false }, expiresAt: new Date() });
  auditMock.mockResolvedValue(undefined);
  dbMock.mockImplementation((table: string) => {
    if (table === 'tenant_provider_connections') return queryBuilder({ id: 'connection-a' });
    if (table === 'provider_verification_runs') return queryBuilder(undefined, [createdRun('stripe', 'sandbox_authentication')]);
    return queryBuilder(undefined);
  });
});

describe('provider verification', () => {
  it('authenticates a Stripe sandbox key only when Stripe reports test mode', async () => {
    stripeFactoryMock.mockReturnValue({ balance: { retrieve: vi.fn().mockResolvedValue({ livemode: false, available: [{ currency: 'usd' }] }) } });
    const result = await runProviderVerification({ tenantId: 'tenant-a', actorId: 'user-a', providerKey: 'stripe', verificationType: 'sandbox_authentication', idempotencyKey: 'fixed-key', requestId: 'request-a' });
    expect(result.status).toBe('passed');
    expect(result.resultCode).toBe('stripe_account_authenticated');
    expect(result.evidence).toMatchObject({ configuredEnvironment: 'sandbox', providerLiveMode: false });
    expect(auditMock).toHaveBeenCalled();
  });

  it('fails closed when Stripe mode does not match the configured environment', async () => {
    stripeFactoryMock.mockReturnValue({ balance: { retrieve: vi.fn().mockResolvedValue({ livemode: true, available: [] }) } });
    const result = await runProviderVerification({ tenantId: 'tenant-a', actorId: 'user-a', providerKey: 'stripe', verificationType: 'sandbox_authentication', idempotencyKey: 'fixed-key', requestId: 'request-a' });
    expect(result).toMatchObject({ status: 'failed', resultCode: 'stripe_environment_mismatch' });
    expect(stripeFactoryMock).toHaveBeenCalledWith('sk_test_123');
  });

  it('authenticates Twilio without sending a message or placing a call', async () => {
    runtimeMock.mockResolvedValue({ ...runtime, providerKey: 'twilio', secrets: { account_sid: 'AC1234567890', auth_token: 'token' } });
    const fetch = vi.fn().mockResolvedValue({ sid: 'AC1234567890', status: 'active' });
    twilioFactoryMock.mockReturnValue({ api: { v2010: { accounts: vi.fn().mockReturnValue({ fetch }) } } });
    const result = await runProviderVerification({ tenantId: 'tenant-a', actorId: 'user-a', providerKey: 'twilio', verificationType: 'account_authentication', idempotencyKey: 'fixed-key', requestId: 'request-a' });
    expect(result.status).toBe('passed');
    expect(result.evidence).toMatchObject({ deliveryTestPerformed: false, accountStatus: 'active' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('marks Fawry readiness without creating a payable reference', async () => {
    runtimeMock.mockResolvedValue({ ...runtime, providerKey: 'fawry', secrets: { secureKey: 'secure-key' }, config: { merchantCode: 'merchant', merchantReferencePrefix: 'INV', currencyCode: 'EGP', language: 'en-gb', paymentEndpointUrl: 'https://sandbox.example.test/pay' } });
    const result = await runProviderVerification({ tenantId: 'tenant-a', actorId: 'user-a', providerKey: 'fawry', verificationType: 'sandbox_readiness', idempotencyKey: 'fixed-key', requestId: 'request-a' });
    expect(result.status).toBe('passed');
    expect(result.evidence).toMatchObject({ paymentReferenceCreated: false, callbackVerified: false });
  });

  it('refuses external verification for manual InstaPay', async () => {
    runtimeMock.mockResolvedValue({ ...runtime, providerKey: 'instapay_manual', config: { walletIdentifier: 'wallet', accountName: 'Clinic', referencePrefix: 'IP', instructions: 'Manual' }, secrets: {} });
    const result = await runProviderVerification({ tenantId: 'tenant-a', actorId: 'user-a', providerKey: 'instapay_manual', verificationType: 'sandbox_readiness', idempotencyKey: 'fixed-key', requestId: 'request-a' });
    expect(result).toMatchObject({ status: 'not_supported', resultCode: 'manual_provider_verification_not_supported' });
  });
});
