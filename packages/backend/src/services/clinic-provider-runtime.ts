import { decryptField } from '@healthcare/shared/utils';
import { db } from '../core/database.js';

export interface TenantProviderRuntime {
  providerKey: string;
  environment: 'sandbox' | 'production';
  status: string;
  validationMode: 'structural' | 'live' | string;
  liveValidationEnabled: boolean;
  validationTimeoutMs: number;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Loads one tenant provider for backend operations only. This module must never
 * be imported by HTTP response mappers or frontend code.
 */
export async function getTenantProviderRuntime(tenantId: string, providerKey: string): Promise<TenantProviderRuntime | null> {
  const connection = await db('tenant_provider_connections')
    .where({ tenant_id: tenantId, provider_key: providerKey })
    .first() as {
      id: string;
      environment: 'sandbox' | 'production';
      status: string;
      validation_mode: 'structural' | 'live' | string;
      live_validation_enabled: boolean;
      validation_timeout_ms: number;
      config_json: unknown;
    } | undefined;

  if (!connection) return null;

  let config = asRecord(connection.config_json);
  if (providerKey === 'eta') {
    const moduleConfiguration = await db('tenant_module_configurations')
      .where({ tenant_id: tenantId, module_key: 'eta' })
      .first() as { config_json: unknown } | undefined;
    config = asRecord(moduleConfiguration?.config_json);
  }

  const rows = await db('clinic_integration_secrets')
    .where({ tenant_id: tenantId, provider: providerKey, connection_id: connection.id, is_active: true })
    .select('secret_key', 'encrypted_value');

  const secrets: Record<string, string> = {};
  for (const row of rows as Array<{ secret_key: string; encrypted_value: string }>) {
    secrets[row.secret_key] = decryptField(row.encrypted_value);
  }

  return {
    providerKey,
    environment: connection.environment,
    status: connection.status,
    validationMode: connection.validation_mode || 'structural',
    liveValidationEnabled: connection.live_validation_enabled === true,
    validationTimeoutMs: connection.validation_timeout_ms || 5000,
    config,
    secrets,
  };
}

export async function providerRuntimeOrFallback(
  tenantId: string | undefined,
  providerKey: string,
  fallback: { config?: Record<string, unknown>; secrets?: Record<string, string> },
): Promise<TenantProviderRuntime | null> {
  if (!tenantId) {
    return {
      providerKey,
      environment: 'production',
      status: 'environment_fallback',
      validationMode: 'structural',
      liveValidationEnabled: false,
      validationTimeoutMs: 5000,
      config: fallback.config || {},
      secrets: fallback.secrets || {},
    };
  }

  const tenantRuntime = await getTenantProviderRuntime(tenantId, providerKey);
  if (tenantRuntime) return tenantRuntime;
  if (Object.keys(fallback.config || {}).length === 0 && Object.keys(fallback.secrets || {}).length === 0) return null;
  return {
    providerKey,
    environment: 'production',
    status: 'environment_fallback',
    validationMode: 'structural',
    liveValidationEnabled: false,
    validationTimeoutMs: 5000,
    config: fallback.config || {},
    secrets: fallback.secrets || {},
  };
}
