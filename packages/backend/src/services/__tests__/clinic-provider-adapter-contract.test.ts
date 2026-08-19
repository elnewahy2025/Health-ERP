import { describe, expect, it } from 'vitest';
import {
  getProviderAdapterContract,
  getProviderAdapterOperation,
  isProviderAdapterOperationImplemented,
} from '../clinic-provider-adapter-contract.js';

describe('Clinic provider adapter contracts', () => {
  it('derives validation and runtime operations from the versioned provider contract', () => {
    const contract = getProviderAdapterContract('fawry');

    expect(contract).toMatchObject({
      providerKey: 'fawry',
      contractVersion: 1,
      supportedTestModes: ['structural', 'live'],
    });
    expect(getProviderAdapterOperation('fawry', 'provider.configuration.validate')).toMatchObject({
      kind: 'validation',
      capability: 'structural_validation',
      status: 'implemented',
    });
    expect(getProviderAdapterOperation('fawry', 'fawry.payment.create')).toMatchObject({
      kind: 'runtime',
      capability: 'business_operation',
      status: 'implemented',
    });
  });

  it('keeps unsupported ETA business operations explicit', () => {
    expect(getProviderAdapterOperation('eta', 'eta.invoice.submit')).toMatchObject({
      kind: 'runtime',
      capability: 'business_operation',
      status: 'not_implemented',
    });
    expect(isProviderAdapterOperationImplemented('eta', 'eta.invoice.submit')).toBe(false);
  });

  it('classifies callback verification as a callback operation', () => {
    expect(getProviderAdapterOperation('stripe', 'stripe.payment.callback.verify')).toMatchObject({
      kind: 'callback',
      capability: 'business_operation',
      status: 'implemented',
    });
    expect(isProviderAdapterOperationImplemented('twilio', 'twilio.voice.callback.verify')).toBe(true);
  });

  it('returns no contract or operation for an unknown provider', () => {
    expect(getProviderAdapterContract('unknown-provider')).toBeNull();
    expect(getProviderAdapterOperation('unknown-provider', 'unknown.operation')).toBeNull();
    expect(isProviderAdapterOperationImplemented('unknown-provider', 'unknown.operation')).toBe(false);
  });
});
