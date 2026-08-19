import { isIP } from 'node:net';
import { getTenantProviderRuntime, type TenantProviderRuntime } from './clinic-provider-runtime.js';
import { getClinicProviderContract, type ClinicProviderContract } from './clinic-provider-contracts.js';
import { getProviderAdapterContract, type ProviderAdapterContract } from './clinic-provider-adapter-contract.js';

export type ProviderAdapterStatus = 'ready' | 'setup_required' | 'invalid' | 'disabled' | 'connection_failed' | 'unsupported';
export type ProviderAdapterTestMode = 'structural' | 'live';

export interface ProviderAdapterResult {
  status: ProviderAdapterStatus;
  code: string;
  message: string;
  missing: string[];
  testMode: ProviderAdapterTestMode;
}

export interface ProviderAdapterContext extends TenantProviderRuntime {
  tenantId: string;
}

export interface ClinicProviderAdapter {
  providerKey: string;
  contract: ClinicProviderContract;
  adapterContract: ProviderAdapterContract;
  validate(context: ProviderAdapterContext): ProviderAdapterResult;
}

function missingResult(providerKey: string, missing: string[], message = 'Provider setup is incomplete'): ProviderAdapterResult {
  return {
    status: 'setup_required',
    code: `${providerKey}_configuration_incomplete`,
    message,
    missing,
    testMode: 'structural',
  };
}

function readyResult(providerKey: string): ProviderAdapterResult {
  return {
    status: 'ready',
    code: `${providerKey}_configuration_valid`,
    message: 'Provider configuration passed structural validation',
    missing: [],
    testMode: 'structural',
  };
}

function invalidResult(providerKey: string, message: string): ProviderAdapterResult {
  return {
    status: 'invalid',
    code: `${providerKey}_configuration_invalid`,
    message,
    missing: [],
    testMode: 'structural',
  };
}

function requiredValues(context: ProviderAdapterContext, configKeys: string[], secretKeys: string[]): string[] {
  const missing = configKeys
    .filter((key) => context.config[key] === undefined || context.config[key] === null || context.config[key] === '')
    .map((key) => `config:${key}`);
  missing.push(...secretKeys.filter((key) => !context.secrets[key]).map((key) => `secret:${key}`));
  return missing;
}

const etaAdapter: ClinicProviderAdapter = {
  providerKey: 'eta',
  contract: getClinicProviderContract('eta')!,
  adapterContract: getProviderAdapterContract('eta')!,
  validate: (context) => {
    const missing = requiredValues(
      context,
      ['taxRegistrationNumber', 'invoiceSeries', 'activityCode', 'identityEndpointUrl', 'systemApiEndpointUrl', 'documentTypeId', 'documentTypeVersionId', 'issuerBranchCode', 'currencyCode', 'taxTypeCode', 'taxRate'],
      ['clientId', 'clientSecret', 'signingCertificate', 'signingPrivateKey'],
    );
    if (missing.length > 0) return missingResult('eta', missing);
    const currencyCode = String(context.config.currencyCode).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) return invalidResult('eta', 'currencyCode must be a three-letter ISO 4217 code');
    const taxRate = Number(context.config.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return invalidResult('eta', 'taxRate must be between 0 and 100');
    for (const key of ['identityEndpointUrl', 'systemApiEndpointUrl']) {
      const endpoint = validateProviderValidationEndpoint(context.config[key], context.environment);
      if ('error' in endpoint) return invalidResult('eta', `${key}: ${endpoint.error}`);
    }
    return readyResult('eta');
  },
};

const fawryAdapter: ClinicProviderAdapter = {
  providerKey: 'fawry',
  contract: getClinicProviderContract('fawry')!,
  adapterContract: getProviderAdapterContract('fawry')!,
  validate: (context) => {
    const missing = requiredValues(
      context,
      ['merchantCode', 'merchantReferencePrefix', 'currencyCode', 'language', 'paymentEndpointUrl'],
      ['secureKey'],
    );
    if (missing.length > 0) return missingResult('fawry', missing);
    const currencyCode = String(context.config.currencyCode).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) return invalidResult('fawry', 'currencyCode must be a three-letter provider currency code');
    if (!['ar-eg', 'en-gb'].includes(String(context.config.language))) return invalidResult('fawry', 'language must be ar-eg or en-gb');
    const endpoint = validateProviderValidationEndpoint(context.config.paymentEndpointUrl, context.environment);
    if ('error' in endpoint) return invalidResult('fawry', endpoint.error);
    return readyResult('fawry');
  },
};

const stripeAdapter: ClinicProviderAdapter = {
  providerKey: 'stripe',
  contract: getClinicProviderContract('stripe')!,
  adapterContract: getProviderAdapterContract('stripe')!,
  validate: (context) => {
    const missing = requiredValues(context, [], ['secretKey']);
    return missing.length > 0 ? missingResult('stripe', missing) : readyResult('stripe');
  },
};

const twilioAdapter: ClinicProviderAdapter = {
  providerKey: 'twilio',
  contract: getClinicProviderContract('twilio')!,
  adapterContract: getProviderAdapterContract('twilio')!,
  validate: (context) => {
    const missing = requiredValues(context, [], ['account_sid', 'auth_token']);
    const hasSender = Boolean(
      context.secrets.voice_number ||
      context.secrets.whatsapp_number ||
      context.secrets.messaging_service_sid,
    );
    if (!hasSender) missing.push('secret:any_sender_number_or_messaging_service');
    return missing.length > 0 ? missingResult('twilio', missing) : readyResult('twilio');
  },
};

export const CLINIC_PROVIDER_ADAPTERS: Readonly<Record<string, ClinicProviderAdapter>> = {
  eta: etaAdapter,
  fawry: fawryAdapter,
  stripe: stripeAdapter,
  twilio: twilioAdapter,
};

export function getClinicProviderAdapter(providerKey: string): ClinicProviderAdapter | null {
  const adapter = CLINIC_PROVIDER_ADAPTERS[providerKey];
  if (!adapter || !adapter.contract) return null;
  return adapter;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const parts = normalized.split('.').map(Number);
    const [first, second] = parts;
    return first === 0 || first === 10 || first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  if (ipVersion === 6) {
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return false;
}

export function validateProviderValidationEndpoint(rawEndpoint: unknown, environment: string): { url: string } | { error: string } {
  if (typeof rawEndpoint !== 'string' || rawEndpoint.trim().length === 0) return { error: 'Live validation endpoint is not configured' };
  try {
    const parsed = new URL(rawEndpoint.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Live validation endpoint must use HTTP or HTTPS' };
    if (parsed.username || parsed.password) return { error: 'Live validation endpoint cannot include credentials' };
    if (isBlockedHostname(parsed.hostname)) return { error: 'Live validation endpoint host is not allowed' };
    if (environment === 'production' && parsed.protocol !== 'https:') return { error: 'Production live validation requires HTTPS' };
    return { url: parsed.toString() };
  } catch {
    return { error: 'Live validation endpoint is not a valid URL' };
  }
}

export async function probeProviderValidationEndpoint(context: ProviderAdapterContext): Promise<ProviderAdapterResult> {
  const endpoint = validateProviderValidationEndpoint(context.config.validationEndpointUrl, context.environment);
  if ('error' in endpoint) {
    return {
      status: 'setup_required',
      code: 'live_validation_endpoint_missing',
      message: endpoint.error,
      missing: ['config:validationEndpointUrl'],
      testMode: 'live',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.validationTimeoutMs);
  try {
    const response = await fetch(endpoint.url, {
      method: 'GET',
      headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.body) {
      try { await response.body.cancel(); } catch { /* response status is sufficient */ }
    }
    if (!response.ok) {
      return {
        status: 'connection_failed',
        code: `live_endpoint_http_${response.status}`,
        message: `Live validation endpoint returned HTTP ${response.status}`,
        missing: [],
        testMode: 'live',
      };
    }
    return {
      status: 'ready',
      code: 'live_endpoint_reachable',
      message: 'Configured live validation endpoint is reachable',
      missing: [],
      testMode: 'live',
    };
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      status: 'connection_failed',
      code: timedOut ? 'live_validation_timeout' : 'live_endpoint_unreachable',
      message: timedOut ? 'Live validation endpoint timed out' : 'Live validation endpoint could not be reached',
      missing: [],
      testMode: 'live',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function validateClinicProviderAdapter(tenantId: string, providerKey: string): Promise<ProviderAdapterResult> {
  const contract = getClinicProviderContract(providerKey);
  const adapter = getClinicProviderAdapter(providerKey);
  if (!contract || !adapter) {
    return {
      status: 'unsupported',
      code: 'provider_contract_unsupported',
      message: `No verified provider contract is registered for provider ${providerKey}`,
      missing: [],
      testMode: 'structural',
    };
  }

  let runtime: TenantProviderRuntime | null;
  try {
    runtime = await getTenantProviderRuntime(tenantId, providerKey);
  } catch {
    return invalidResult(providerKey, 'Provider credentials could not be loaded safely');
  }
  if (!runtime) return missingResult(providerKey, ['connection'], 'Save the provider connection before testing it');
  if (runtime.status === 'disabled') {
    return {
      status: 'disabled',
      code: 'provider_disabled',
      message: 'Provider connection is disabled for this clinic',
      missing: [],
      testMode: 'structural',
    };
  }

  const structural = adapter.validate({ tenantId, ...runtime });
  if (structural.status !== 'ready') return structural;
  if (runtime.validationMode !== 'live' || !runtime.liveValidationEnabled) return structural;
  return probeProviderValidationEndpoint({ tenantId, ...runtime });
}
