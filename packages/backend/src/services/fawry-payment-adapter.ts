import crypto from 'node:crypto';
import { validateProviderValidationEndpoint } from './clinic-provider-adapters.js';
import type { TenantProviderRuntime } from './clinic-provider-runtime.js';

export type FawryLanguage = 'ar-eg' | 'en-gb';

export interface FawryChargeInput {
  merchantReference: string;
  amount: number;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  description: string;
  itemId: string;
  language: FawryLanguage;
}

export interface FawryChargeRequest {
  merchantCode: string;
  merchantRefNum: string;
  paymentMethod: 'PayAtFawry';
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  amount: number;
  currencyCode: string;
  language: FawryLanguage;
  chargeItems: Array<{
    itemId: string;
    description: string;
    price: number;
    quantity: number;
  }>;
  signature: string;
  description: string;
}

export interface FawryChargeResult {
  ok: boolean;
  status: 'pending' | 'rejected' | 'connection_failed' | 'setup_required';
  code: string;
  referenceNumber?: string;
  merchantReference?: string;
  providerStatus?: string;
}

export function formatFawryAmount(amount: number): string {
  return amount.toFixed(2);
}

export function buildFawrySignature(
  merchantCode: string,
  merchantReference: string,
  paymentMethod: string,
  amount: number,
  secureKey: string,
): string {
  const canonical = [
    merchantCode,
    merchantReference,
    paymentMethod,
    formatFawryAmount(amount),
    secureKey,
  ].join('');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function buildFawryChargeRequest(
  runtime: TenantProviderRuntime,
  input: FawryChargeInput,
): FawryChargeRequest | { error: string } {
  const merchantCode = String(runtime.config.merchantCode || '').trim();
  const currencyCode = String(runtime.config.currencyCode || '').trim().toUpperCase();
  const secureKey = runtime.secrets.secureKey || '';
  if (!merchantCode || !currencyCode || !secureKey) return { error: 'Fawry provider configuration is incomplete' };
  if (!/^[A-Z]{3}$/.test(currencyCode)) return { error: 'Fawry currencyCode must be a three-letter provider currency code' };

  const paymentMethod = 'PayAtFawry' as const;
  const request: FawryChargeRequest = {
    merchantCode,
    merchantRefNum: input.merchantReference,
    paymentMethod,
    customerName: input.customerName,
    customerMobile: input.customerPhone,
    customerEmail: input.customerEmail,
    amount: Number(formatFawryAmount(input.amount)),
    currencyCode,
    language: input.language,
    chargeItems: [{
      itemId: input.itemId,
      description: input.description,
      price: Number(formatFawryAmount(input.amount)),
      quantity: 1,
    }],
    signature: buildFawrySignature(merchantCode, input.merchantReference, paymentMethod, input.amount, secureKey),
    description: input.description,
  };
  return request;
}

function safeProviderStatus(body: Record<string, unknown>): string {
  return String(body.statusCode ?? body.type ?? '').trim();
}

function responseReference(body: Record<string, unknown>): string {
  return String(body.referenceNumber ?? body.fawryRefNumber ?? '').trim();
}

function statusIsSuccessful(status: string): boolean {
  return status === '200' || status.toUpperCase() === 'SUCCESS' || status.toUpperCase() === 'OK';
}

export async function requestFawryPayment(
  runtime: TenantProviderRuntime,
  input: FawryChargeInput,
): Promise<FawryChargeResult> {
  const endpoint = validateProviderValidationEndpoint(runtime.config.paymentEndpointUrl, runtime.environment);
  if ('error' in endpoint) {
    return { ok: false, status: 'setup_required', code: 'fawry_payment_endpoint_invalid' };
  }

  const request = buildFawryChargeRequest(runtime, input);
  if ('error' in request) {
    return { ok: false, status: 'setup_required', code: 'fawry_configuration_incomplete' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.validationTimeoutMs);
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(request),
      redirect: 'error',
      signal: controller.signal,
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }

    if (!response.ok) return { ok: false, status: 'connection_failed', code: `fawry_http_${response.status}` };
    const providerStatus = safeProviderStatus(body);
    const referenceNumber = responseReference(body);
    if (!statusIsSuccessful(providerStatus) || !referenceNumber) {
      return { ok: false, status: 'rejected', code: `fawry_provider_rejected_${providerStatus || 'unknown'}` };
    }
    return {
      ok: true,
      status: 'pending',
      code: 'fawry_payment_reference_created',
      referenceNumber,
      merchantReference: input.merchantReference,
      providerStatus,
    };
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { ok: false, status: 'connection_failed', code: timedOut ? 'fawry_payment_timeout' : 'fawry_payment_unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
