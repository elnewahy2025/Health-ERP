import { getTenantProviderRuntime, type TenantProviderRuntime } from './clinic-provider-runtime.js';

export type ProviderAdapterStatus = 'ready' | 'setup_required' | 'invalid' | 'disabled' | 'unsupported';

export interface ProviderAdapterResult {
  status: ProviderAdapterStatus;
  code: string;
  message: string;
  missing: string[];
  testMode: 'structural';
}

export interface ProviderAdapterContext extends TenantProviderRuntime {
  tenantId: string;
}

export interface ClinicProviderAdapter {
  providerKey: string;
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
  validate: (context) => {
    const missing = requiredValues(
      context,
      ['taxRegistrationNumber', 'invoiceSeries', 'activityCode'],
      ['clientId', 'clientSecret', 'signingKey'],
    );
    return missing.length > 0 ? missingResult('eta', missing) : readyResult('eta');
  },
};

const fawryAdapter: ClinicProviderAdapter = {
  providerKey: 'fawry',
  validate: (context) => {
    const missing = requiredValues(context, ['merchantCode', 'merchantReferencePrefix', 'currencyCode'], ['secureKey']);
    if (missing.length > 0) return missingResult('fawry', missing);
    const currencyCode = String(context.config.currencyCode).toUpperCase();
    if (currencyCode.length !== 3) return invalidResult('fawry', 'currencyCode must be a three-letter provider currency code');
    return readyResult('fawry');
  },
};

const stripeAdapter: ClinicProviderAdapter = {
  providerKey: 'stripe',
  validate: (context) => {
    const missing = requiredValues(context, [], ['secretKey']);
    return missing.length > 0 ? missingResult('stripe', missing) : readyResult('stripe');
  },
};

const twilioAdapter: ClinicProviderAdapter = {
  providerKey: 'twilio',
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
  return CLINIC_PROVIDER_ADAPTERS[providerKey] || null;
}

export async function validateClinicProviderAdapter(tenantId: string, providerKey: string): Promise<ProviderAdapterResult> {
  const adapter = getClinicProviderAdapter(providerKey);
  if (!adapter) {
    return {
      status: 'unsupported',
      code: 'provider_adapter_unsupported',
      message: `No adapter is registered for provider ${providerKey}`,
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

  return adapter.validate({ tenantId, ...runtime });
}
