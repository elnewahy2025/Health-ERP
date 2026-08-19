import { describe, expect, it } from 'vitest';
import { getProviderErrorInfo } from '../lib/provider-errors';

describe('provider error classification', () => {
  it('extracts safe unsupported-operation details from an AppError envelope', () => {
    expect(getProviderErrorInfo({
      response: {
        status: 409,
        data: {
          error: 'The eta provider contract does not support this operation yet.',
          code: 'PROVIDER_OPERATION_NOT_SUPPORTED',
          details: { providerKey: 'eta', operationKey: 'eta.invoice.submit' },
        },
      },
    })).toEqual({
      kind: 'unsupported_operation',
      message: 'The eta provider contract does not support this operation yet.',
      providerKey: 'eta',
      operationKey: 'eta.invoice.submit',
    });
  });

  it('recognizes legacy plain provider readiness errors without exposing response internals', () => {
    expect(getProviderErrorInfo({
      response: {
        status: 409,
        data: { error: 'Fawry is not ready for this clinic. Complete the provider setup in Settings > Integrations.' },
      },
    })).toMatchObject({ kind: 'not_ready' });
    expect(getProviderErrorInfo({ response: { status: 409, data: { error: 'Fawry is disabled for this clinic.' } } }))
      .toMatchObject({ kind: 'disabled' });
  });

  it('does not classify unrelated failures as provider capability failures', () => {
    expect(getProviderErrorInfo({ response: { status: 500, data: { error: 'Database unavailable' } } })).toBeNull();
    expect(getProviderErrorInfo(new Error('Network error'))).toBeNull();
  });
});
