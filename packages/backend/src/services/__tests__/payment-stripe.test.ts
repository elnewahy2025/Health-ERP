import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, runtimeMock, stripeFactoryMock, listConfigMock, auditMock } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  runtimeMock: vi.fn(),
  stripeFactoryMock: vi.fn(),
  listConfigMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('../../core/database.js', () => ({ db: dbMock }));
vi.mock('../clinic-provider-runtime.js', () => ({ providerRuntimeOrFallback: runtimeMock }));
vi.mock('../clinic-provider-capabilities.js', () => ({ assertClinicProviderOperation: vi.fn() }));
vi.mock('../audit.js', () => ({ logAudit: auditMock }));
vi.mock('../clinic-configuration.js', () => ({ listEffectiveClinicConfiguration: listConfigMock }));
vi.mock('@healthcare/shared/config', () => ({ getEnv: () => ({ APP_URL: 'https://clinic.example.test', STRIPE_SECRET_KEY: '' }) }));
vi.mock('@healthcare/shared/config/clinic-configuration', () => ({ clinicConfigurationDefinition: () => ({ defaultValue: 'EGP' }) }));
vi.mock('stripe', () => ({ default: stripeFactoryMock }));

const { createStripePayment } = await import('../payment.js');

function query(firstRow: unknown) {
  const builder: Record<string, any> = {};
  const chain = () => builder;
  for (const method of ['where', 'whereNull', 'select', 'forUpdate']) builder[method] = vi.fn(chain);
  builder.first = vi.fn().mockResolvedValue(firstRow);
  builder.insert = vi.fn().mockResolvedValue([firstRow]);
  builder.update = vi.fn().mockResolvedValue(1);
  builder.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  return builder;
}

const runtime = {
  providerKey: 'stripe', environment: 'sandbox', status: 'configured', validationMode: 'structural', liveValidationEnabled: false,
  validationTimeoutMs: 1000, config: {}, secrets: { secretKey: 'sk_test_clinic' },
};

beforeEach(() => {
  dbMock.mockReset(); runtimeMock.mockReset(); stripeFactoryMock.mockReset(); listConfigMock.mockReset(); auditMock.mockReset();
  runtimeMock.mockResolvedValue(runtime);
  listConfigMock.mockResolvedValue([{ key: 'clinic.profile.display_name', value: 'Configured Clinic' }]);
  auditMock.mockResolvedValue(undefined);
});

describe('Stripe payment service', () => {
  it('creates one idempotent sandbox checkout and replays the persisted session on retry', async () => {
    const paymentQuery = query(undefined);
    const paymentInsert = paymentQuery.insert as ReturnType<typeof vi.fn>;
    const invoice = { id: 'invoice-a', tenant_id: 'tenant-a', patient_id: 'patient-a', invoice_number: 'INV-001', total: '100.00', paid: '0.00' };
    const session = { id: 'cs_test_001', url: 'https://checkout.stripe.test/cs_test_001' };
    const stripeClient = { checkout: { sessions: { create: vi.fn().mockResolvedValue(session) } } };
    stripeFactoryMock.mockImplementation(function () { return stripeClient; });
    dbMock.mockImplementation((table: string) => {
      if (table === 'payment_transactions') return paymentQuery;
      if (table === 'invoices') return query(invoice);
      if (table === 'patients') return query({ email: 'patient@example.test' });
      if (table === 'tenants') return query({ name: 'Tenant Clinic' });
      return query(undefined);
    });

    const first = await createStripePayment('invoice-a', 25, 'EGP', 'tenant-a', 'stripe-checkout:invoice-a:key-001');
    expect(first).toMatchObject({ success: true, paymentId: 'cs_test_001', environment: 'sandbox', status: 'pending' });
    expect(stripeClient.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(stripeClient.checkout.sessions.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'stripe-checkout:invoice-a:key-001' });
    expect(paymentInsert).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key: 'stripe-checkout:invoice-a:key-001', provider_environment: 'sandbox', provider_currency: 'EGP', status: 'creating' }));

    paymentQuery.first.mockResolvedValue({ reference: 'cs_test_001', provider_url: session.url, status: 'pending', provider_environment: 'sandbox', provider_currency: 'EGP', amount: '25.00' });
    const second = await createStripePayment('invoice-a', 25, 'EGP', 'tenant-a', 'stripe-checkout:invoice-a:key-001');
    expect(second).toMatchObject({ success: true, paymentId: 'cs_test_001', redirectUrl: session.url, status: 'pending' });
    expect(stripeClient.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});
