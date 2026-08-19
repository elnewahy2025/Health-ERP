import Fastify, { type FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../core/error-handler.js';

const { dbMock, runtimeMock, confirmStripePaymentMock, requestFawryPaymentMock } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  runtimeMock: vi.fn(),
  confirmStripePaymentMock: vi.fn(),
  requestFawryPaymentMock: vi.fn(),
}));

vi.mock('../../core/database.js', () => ({ db: dbMock }));
vi.mock('../../services/clinic-provider-runtime.js', () => ({ providerRuntimeOrFallback: runtimeMock }));
vi.mock('../../services/payment.js', () => ({ confirmStripePayment: confirmStripePaymentMock }));
vi.mock('../../services/fawry-payment-adapter.js', () => ({ requestFawryPayment: requestFawryPaymentMock }));
vi.mock('../../services/audit.js', () => ({ logAudit: vi.fn() }));
vi.mock('../../services/clinic-modules.js', () => ({ enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined) }));

const { registerFinancialDeepeningModule } = await import('../financial-deepening/index.js');
const { registerBillingModule } = await import('../billing/index.js');

function queryBuilder(rows: unknown[], firstRow: unknown = rows[0]) {
  const query: Record<string, any> = {};
  const chain = () => query;
  for (const method of ['where', 'andWhere', 'whereNull', 'whereNotNull', 'whereIn', 'join', 'select', 'forUpdate', 'orderBy', 'distinct']) {
    query[method] = vi.fn(chain);
  }
  query.first = vi.fn().mockResolvedValue(firstRow);
  query.update = vi.fn().mockResolvedValue(1);
  query.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(rows).then(onFulfilled, onRejected);
  return query;
}

function fawryBody(signature: string, overrides: Record<string, unknown> = {}) {
  return {
    fawryRefNumber: 'FW-001',
    merchantRefNumber: 'INV-001',
    paymentAmount: '100.00',
    orderAmount: '100.00',
    orderStatus: 'PAID',
    paymentMethod: 'CARD',
    paymentRefrenceNumber: 'PAY-001',
    messageSignature: signature,
    ...overrides,
  };
}

function fawrySignature(body: Record<string, unknown>, secureKey: string): string {
  const canonical = [
    body.fawryRefNumber,
    body.merchantRefNumber,
    Number(body.paymentAmount).toFixed(2),
    Number(body.orderAmount).toFixed(2),
    body.orderStatus,
    body.paymentMethod,
    body.paymentRefrenceNumber,
    secureKey,
  ].join('');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function stripeSignature(rawBody: string, secret: string, timestamp: number): string {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('Fawry callback route', () => {
  let app: FastifyInstance;
  let paymentStatus = 'pending';
  let invoiceUpdateCount = 0;
  const secureKey = 'secure-key';

  beforeEach(async () => {
    paymentStatus = 'pending';
    invoiceUpdateCount = 0;
    dbMock.mockReset();
    runtimeMock.mockReset();
    runtimeMock.mockResolvedValue({ status: 'configured', secrets: { secureKey } });
    const paymentRow = { id: 'payment-a', tenant_id: 'tenant-a', invoice_id: 'invoice-a', amount: '100.00', status: paymentStatus };
    const invoiceRow = { id: 'invoice-a', total: '100.00', paid: '0.00' };
    dbMock.mockImplementation((table: string) => {
      if (table === 'payment_transactions') return queryBuilder([paymentRow], paymentRow);
      if (table === 'invoices') {
        const query = queryBuilder([invoiceRow], invoiceRow);
        query.update = vi.fn().mockImplementation(async () => { invoiceUpdateCount += 1; return 1; });
        return query;
      }
      return queryBuilder([]);
    });
    (dbMock as any).transaction = vi.fn().mockImplementation(async (callback: (trx: any) => Promise<unknown>) => callback((table: string) => {
      if (table === 'payment_transactions') {
        const query = queryBuilder([paymentRow], { ...paymentRow, status: paymentStatus });
        query.update = vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
          paymentStatus = String(data.status);
          return 1;
        });
        return query;
      }
      if (table === 'invoices') {
        const query = queryBuilder([invoiceRow], invoiceRow);
        query.update = vi.fn().mockImplementation(async () => { invoiceUpdateCount += 1; return 1; });
        return query;
      }
      return queryBuilder([]);
    }));

    app = Fastify();
    app.setErrorHandler(errorHandler);
    await registerFinancialDeepeningModule(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid signed PAID callback and finalizes the invoice once', async () => {
    const unsigned = fawryBody('');
    const body = fawryBody(fawrySignature(unsigned, secureKey));
    const first = await app.inject({ method: 'POST', url: '/api/v1/payments/fawry/callback', payload: body });
    const second = await app.inject({ method: 'POST', url: '/api/v1/payments/fawry/callback', payload: body });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(paymentStatus).toBe('completed');
    expect(invoiceUpdateCount).toBe(1);
  });

  it('rejects invalid signatures and amount mismatches before state mutation', async () => {
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/payments/fawry/callback', payload: fawryBody('bad') });
    expect(invalid.statusCode).toBe(401);
    expect(paymentStatus).toBe('pending');
    expect(invoiceUpdateCount).toBe(0);

    const mismatch = fawryBody('');
    mismatch.orderAmount = '99.00';
    mismatch.messageSignature = fawrySignature(mismatch, secureKey);
    const response = await app.inject({ method: 'POST', url: '/api/v1/payments/fawry/callback', payload: mismatch });
    expect(response.statusCode).toBe(409);
    expect(paymentStatus).toBe('pending');
    expect(invoiceUpdateCount).toBe(0);
  });
});

describe('Fawry creation route', () => {
  let app: FastifyInstance;
  let paymentInsert: ReturnType<typeof vi.fn>;
  const providerRuntime = {
    providerKey: 'fawry',
    environment: 'sandbox',
    status: 'configured',
    validationMode: 'structural',
    liveValidationEnabled: false,
    validationTimeoutMs: 1000,
    config: {
      merchantCode: 'merchant-code',
      merchantReferencePrefix: 'INV',
      currencyCode: 'EGP',
      language: 'en-gb',
      paymentEndpointUrl: 'https://payments.example.test/fawry',
    },
    secrets: { secureKey: 'secure-key' },
  };

  beforeEach(async () => {
    dbMock.mockReset();
    runtimeMock.mockReset();
    requestFawryPaymentMock.mockReset();
    runtimeMock.mockResolvedValue(providerRuntime);
    requestFawryPaymentMock.mockResolvedValue({
      ok: true,
      status: 'pending',
      code: 'fawry_payment_reference_created',
      referenceNumber: 'FW-PROVIDER-001',
      merchantReference: 'INV-001',
      providerStatus: '200',
    });

    const invoiceRow = {
      id: '00000000-0000-4000-8000-000000000001',
      tenant_id: 'tenant-a',
      invoice_number: 'INV-001',
      total: '100.00',
      paid: '0.00',
      due: '100.00',
      deleted_at: null,
    };
    const paymentQuery = queryBuilder([]);
    paymentInsert = vi.fn().mockReturnValue(paymentQuery);
    paymentQuery.insert = paymentInsert;
    paymentQuery.returning = vi.fn().mockResolvedValue([{ id: 'payment-a' }]);
    dbMock.mockImplementation((table: string) => table === 'invoices' ? queryBuilder([invoiceRow], invoiceRow) : paymentQuery);

    app = Fastify();
    app.decorate('authenticate', async (request: any) => {
      request.tenantId = 'tenant-a';
      request.ctx = {
        tenantId: 'tenant-a',
        userId: 'user-a',
        roles: [],
        permissions: ['billing.create'],
        branches: [],
        locale: 'en',
        requestId: 'request-a',
        principal: {
          tenantId: 'tenant-a',
          userId: 'user-a',
          roles: [],
          grants: [{ permission: 'billing.create', scope: 'tenant' }],
          denials: [],
          branches: [],
        },
      };
    });
    app.setErrorHandler(errorHandler);
    await registerFinancialDeepeningModule(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('calls the tenant-configured provider and stores merchant and provider references separately', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/fawry/create',
      payload: {
        invoiceId: '00000000-0000-4000-8000-000000000001',
        amount: 100,
        customerPhone: '+201000000000',
        customerName: 'Patient Example',
        customerEmail: 'patient@example.test',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ referenceNumber: 'FW-PROVIDER-001', status: 'pending' });
    expect(runtimeMock).toHaveBeenCalledWith('tenant-a', 'fawry', expect.any(Object));
    expect(requestFawryPaymentMock).toHaveBeenCalledWith(providerRuntime, expect.objectContaining({
      merchantReference: expect.stringContaining('INV-INV-001-'),
      customerEmail: 'patient@example.test',
    }));
    expect(paymentInsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 'tenant-a',
      provider_key: 'fawry',
      reference: expect.stringContaining('INV-INV-001-'),
      provider_reference: 'FW-PROVIDER-001',
      status: 'pending',
    }));
  });

  it('does not call the provider when the tenant endpoint is not configured', async () => {
    runtimeMock.mockResolvedValue({ ...providerRuntime, config: { ...providerRuntime.config, paymentEndpointUrl: '' } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/fawry/create',
      payload: {
        invoiceId: '00000000-0000-4000-8000-000000000001',
        amount: 100,
        customerPhone: '+201000000000',
        customerName: 'Patient Example',
        customerEmail: 'patient@example.test',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(requestFawryPaymentMock).not.toHaveBeenCalled();
    expect(paymentInsert).not.toHaveBeenCalled();
  });
});

describe('Stripe webhook route', () => {
  let app: FastifyInstance;
  const webhookSecret = 'whsec_test';

  beforeEach(async () => {
    dbMock.mockReset();
    runtimeMock.mockReset();
    confirmStripePaymentMock.mockReset();
    runtimeMock.mockResolvedValue({ status: 'configured', secrets: { webhookSecret } });
    confirmStripePaymentMock.mockResolvedValue(true);
    dbMock.mockImplementation((table: string) => table === 'payment_transactions'
      ? queryBuilder([{ tenant_id: 'tenant-a' }], { tenant_id: 'tenant-a' })
      : queryBuilder([]));

    app = Fastify();
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
      (request as any).rawBody = String(body);
      done(null, JSON.parse(String(body)));
    });
    app.setErrorHandler(errorHandler);
    await registerBillingModule(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid Stripe signatures and accepts a verified completion event', async () => {
    const event = { id: 'evt-001', type: 'checkout.session.completed', data: { object: { id: 'cs-001' } } };
    const rawBody = JSON.stringify(event);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/payments/stripe/webhook', payload: rawBody, headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' } });
    expect(invalid.statusCode).toBe(401);
    expect(confirmStripePaymentMock).not.toHaveBeenCalled();

    const timestamp = Math.floor(Date.now() / 1000);
    const valid = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/stripe/webhook',
      payload: rawBody,
      headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignature(rawBody, webhookSecret, timestamp) },
    });
    expect(valid.statusCode).toBe(200);
    expect(confirmStripePaymentMock).toHaveBeenCalledWith('cs-001');
  });
});
