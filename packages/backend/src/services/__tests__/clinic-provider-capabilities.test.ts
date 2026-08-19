import { describe, expect, it } from 'vitest';
import { hasClinicProviderOperation, assertClinicProviderOperation } from '../clinic-provider-capabilities.js';

describe('Clinic provider operation capabilities', () => {
  it('allows only operations registered as working provider runtime paths', () => {
    expect(hasClinicProviderOperation('fawry', 'fawry.payment.create')).toBe(true);
    expect(hasClinicProviderOperation('stripe', 'stripe.checkout.create')).toBe(true);
    expect(hasClinicProviderOperation('twilio', 'twilio.sms.send')).toBe(true);
    expect(hasClinicProviderOperation('twilio', 'twilio.voice.callback.verify')).toBe(true);
  });

  it('rejects ETA vendor submission until a verified contract is implemented', () => {
    expect(hasClinicProviderOperation('eta', 'eta.invoice.submit')).toBe(false);
    expect(() => assertClinicProviderOperation('eta', 'eta.invoice.submit')).toThrowError(
      'The eta provider contract does not support this operation yet.',
    );
  });

  it('returns a safe unsupported error for unknown providers without tenant or secret data', () => {
    expect(() => assertClinicProviderOperation('unknown-provider', 'unknown.operation')).toThrowError(
      'The unknown-provider provider contract does not support this operation yet.',
    );
    try {
      assertClinicProviderOperation('unknown-provider', 'unknown.operation');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 'PROVIDER_OPERATION_NOT_SUPPORTED',
        statusCode: 409,
        details: { providerKey: 'unknown-provider', operationKey: 'unknown.operation' },
      });
      expect(JSON.stringify(error)).not.toContain('secret');
    }
  });
});
