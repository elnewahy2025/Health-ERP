import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFawryChargeRequest,
  buildFawrySignature,
  requestFawryPayment,
} from '../fawry-payment-adapter.js';
import type { TenantProviderRuntime } from '../clinic-provider-runtime.js';

const runtime: TenantProviderRuntime = {
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

const input = {
  merchantReference: 'INV-0001-123',
  amount: 125.5,
  customerPhone: '+201000000000',
  customerName: 'Patient Example',
  customerEmail: 'patient@example.test',
  description: 'Invoice INV-0001',
  itemId: 'INV-0001',
  language: 'en-gb' as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Fawry payment adapter', () => {
  it('uses the documented merchant signature concatenation and two-decimal amount', () => {
    const expected = crypto.createHash('sha256')
      .update('merchant-codemerchant-refPayAtFawry125.50secure-key', 'utf8')
      .digest('hex');
    expect(buildFawrySignature('merchant-code', 'merchant-ref', 'PayAtFawry', 125.5, 'secure-key')).toBe(expected);
  });

  it('builds the documented request shape without including the secure key', () => {
    const request = buildFawryChargeRequest(runtime, input);
    expect(request).toMatchObject({
      merchantCode: 'merchant-code',
      merchantRefNum: 'INV-0001-123',
      paymentMethod: 'PayAtFawry',
      customerMobile: '+201000000000',
      customerEmail: 'patient@example.test',
      amount: 125.5,
      currencyCode: 'EGP',
      language: 'en-gb',
    });
    expect(request).toHaveProperty('chargeItems', [{
      itemId: 'INV-0001',
      description: 'Invoice INV-0001',
      price: 125.5,
      quantity: 1,
    }]);
    expect(JSON.stringify(request)).not.toContain('secure-key');
  });

  it('normalizes a successful provider response into a pending local payment result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: '200',
      statusDescription: 'Operation done successfully',
      referenceNumber: '970177',
      orderStatus: 'NEW',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestFawryPayment(runtime, input)).resolves.toMatchObject({
      ok: true,
      status: 'pending',
      code: 'fawry_payment_reference_created',
      referenceNumber: '970177',
      merchantReference: 'INV-0001-123',
      providerStatus: '200',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://payments.example.test/fawry', expect.objectContaining({ method: 'POST' }));
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(requestInit.body)).not.toContain('secure-key');
  });

  it('returns a safe rejection for provider error responses and never calls an unconfigured endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: '9946',
      statusDescription: 'Blank or invalid signature',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestFawryPayment(runtime, input)).resolves.toMatchObject({
      ok: false,
      status: 'rejected',
      code: 'fawry_provider_rejected_9946',
    });

    const missingEndpoint = { ...runtime, config: { ...runtime.config, paymentEndpointUrl: '' } };
    await expect(requestFawryPayment(missingEndpoint, input)).resolves.toMatchObject({
      ok: false,
      status: 'setup_required',
      code: 'fawry_payment_endpoint_invalid',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
