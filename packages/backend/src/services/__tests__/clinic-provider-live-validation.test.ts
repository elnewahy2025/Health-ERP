import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  probeProviderValidationEndpoint,
  validateProviderValidationEndpoint,
  type ProviderAdapterContext,
} from '../clinic-provider-adapters.js';

function context(endpoint: string, environment: 'sandbox' | 'production' = 'sandbox', timeoutMs = 1000): ProviderAdapterContext {
  return {
    tenantId: 'tenant-1',
    providerKey: 'stripe',
    environment,
    status: 'configured',
    validationMode: 'live',
    liveValidationEnabled: true,
    validationTimeoutMs: timeoutMs,
    config: { validationEndpointUrl: endpoint },
    secrets: { secretKey: 'never-send-this' },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Clinic provider live-validation boundary', () => {
  it('rejects local, private, credential-bearing, and insecure production endpoints', () => {
    expect(validateProviderValidationEndpoint('http://127.0.0.1:8080/health', 'sandbox')).toEqual({ error: 'Live validation endpoint host is not allowed' });
    expect(validateProviderValidationEndpoint('http://10.0.0.5/health', 'sandbox')).toEqual({ error: 'Live validation endpoint host is not allowed' });
    expect(validateProviderValidationEndpoint('https://user:pass@example.com/health', 'sandbox')).toEqual({ error: 'Live validation endpoint cannot include credentials' });
    expect(validateProviderValidationEndpoint('http://example.com/health', 'production')).toEqual({ error: 'Production live validation requires HTTPS' });
  });

  it('probes only the configured endpoint and never sends provider secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeProviderValidationEndpoint(context('https://status.example.test/health'));

    expect(result).toMatchObject({ status: 'ready', code: 'live_endpoint_reachable', testMode: 'live' });
    expect(fetchMock).toHaveBeenCalledWith('https://status.example.test/health', expect.objectContaining({
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
    }));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('never-send-this');
  });

  it('maps provider endpoint HTTP failures to safe connection results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    }));

    const result = await probeProviderValidationEndpoint(context('https://status.example.test/health'));

    expect(result).toEqual({
      status: 'connection_failed',
      code: 'live_endpoint_http_503',
      message: 'Live validation endpoint returned HTTP 503',
      missing: [],
      testMode: 'live',
    });
  });

  it('aborts a slow endpoint at the configured timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<never>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })));

    const pending = probeProviderValidationEndpoint(context('https://status.example.test/health', 'sandbox', 1000));
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result).toMatchObject({
      status: 'connection_failed',
      code: 'live_validation_timeout',
      testMode: 'live',
    });
  });
});
