interface ProviderErrorEnvelope {
  response?: {
    status?: number;
    data?: {
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };
  };
  message?: unknown;
}

export type ProviderErrorKind = 'unsupported_operation' | 'not_ready' | 'disabled' | 'unknown';

export interface ProviderErrorInfo {
  kind: ProviderErrorKind;
  message: string;
  providerKey?: string;
  operationKey?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function getProviderErrorInfo(error: unknown): ProviderErrorInfo | null {
  const envelope = asRecord(error) as ProviderErrorEnvelope | null;
  const responseData = asRecord(envelope?.response?.data);
  const code = typeof responseData?.code === 'string' ? responseData.code : '';
  const message = typeof responseData?.error === 'string'
    ? responseData.error
    : typeof envelope?.message === 'string'
      ? envelope.message
      : '';
  const status = envelope?.response?.status;
  const details = asRecord(responseData?.details);
  const providerKey = typeof details?.providerKey === 'string' ? details.providerKey : undefined;
  const operationKey = typeof details?.operationKey === 'string' ? details.operationKey : undefined;
  const normalizedMessage = message.toLowerCase();

  if (code === 'PROVIDER_OPERATION_NOT_SUPPORTED' || normalizedMessage.includes('provider contract does not support')) {
    return { kind: 'unsupported_operation', message, providerKey, operationKey };
  }
  if (normalizedMessage.includes('provider is disabled') || normalizedMessage.includes('is disabled for this clinic')) {
    return { kind: 'disabled', message, providerKey };
  }
  if (
    normalizedMessage.includes('provider is not ready')
    || normalizedMessage.includes('not configured for this clinic')
    || normalizedMessage.includes('complete the provider setup')
    || (status === 409 && normalizedMessage.includes('provider'))
  ) {
    return { kind: 'not_ready', message, providerKey };
  }
  return null;
}
