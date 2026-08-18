import { encryptField, hashString } from '@healthcare/shared/utils';
import { db } from '../core/database.js';
import { ConflictError, NotFoundError, ValidationError } from '@healthcare/shared/errors';
import { logAudit } from './audit.js';
import { validateClinicProviderAdapter } from './clinic-provider-adapters.js';
import { getClinicProviderContract, type ClinicProviderContract } from './clinic-provider-contracts.js';

export type ProviderEnvironment = 'sandbox' | 'production';
export type ProviderConnectionStatus = 'setup_required' | 'configured' | 'disabled' | 'invalid';
export type ProviderTestStatus = 'not_tested' | 'passed' | 'failed' | 'expired';
export const DEFAULT_PROVIDER_VALIDATION_TIMEOUT_MS = 5000;
export const MIN_PROVIDER_VALIDATION_TIMEOUT_MS = 1000;
export const MAX_PROVIDER_VALIDATION_TIMEOUT_MS = 30000;

interface ProviderDefinition {
  providerKey: string;
  moduleKey: string;
  displayName: string;
  jurisdictionCode?: string;
  configKeys: readonly string[];
  optionalConfigKeys?: readonly string[];
  secretKeys: readonly string[];
  requiredSecretKeys?: readonly string[];
  secretGroups?: readonly (readonly string[])[];
  moduleConfigurationKey?: string;
}

export const CLINIC_PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    providerKey: 'eta',
    moduleKey: 'integrations',
    displayName: 'Egyptian Tax Authority',
    jurisdictionCode: 'EG',
    configKeys: ['taxRegistrationNumber', 'invoiceSeries', 'activityCode', 'validationEndpointUrl'],
    optionalConfigKeys: ['validationEndpointUrl'],
    secretKeys: ['clientId', 'clientSecret', 'signingKey'],
    requiredSecretKeys: ['clientId', 'clientSecret', 'signingKey'],
    moduleConfigurationKey: 'eta',
  },
  {
    providerKey: 'fawry',
    moduleKey: 'integrations',
    displayName: 'Fawry',
    jurisdictionCode: 'EG',
    configKeys: ['merchantCode', 'merchantReferencePrefix', 'currencyCode', 'validationEndpointUrl'],
    optionalConfigKeys: ['validationEndpointUrl'],
    secretKeys: ['secureKey', 'hashKey'],
    requiredSecretKeys: ['secureKey'],
  },
  {
    providerKey: 'stripe',
    moduleKey: 'integrations',
    displayName: 'Stripe',
    configKeys: ['currency', 'validationEndpointUrl'],
    optionalConfigKeys: ['validationEndpointUrl'],
    secretKeys: ['secretKey', 'publishableKey', 'webhookSecret'],
    requiredSecretKeys: ['secretKey'],
  },
  {
    providerKey: 'twilio',
    moduleKey: 'integrations',
    displayName: 'Twilio',
    configKeys: ['validationEndpointUrl'],
    optionalConfigKeys: ['validationEndpointUrl'],
    secretKeys: ['account_sid', 'auth_token', 'messaging_service_sid', 'whatsapp_number', 'voice_number'],
    requiredSecretKeys: ['account_sid', 'auth_token'],
    secretGroups: [['messaging_service_sid', 'whatsapp_number', 'voice_number']],
  },
] as const;

interface RegionalProfileRow {
  tenant_id: string;
  country_code: string | null;
  profile_key: string;
  status: string;
  national_identifier_policy: string;
  phone_policy: string;
  tax_profile_key: string | null;
  metadata_json: unknown;
  version: number;
  configured_by: string | null;
  configured_at: Date | string | null;
  updated_at: Date | string;
}

interface ModuleConfigurationRow {
  module_key: string;
  config_json: unknown;
  version: number;
  last_validation_status: string;
  last_validation_errors: unknown;
}

interface ProviderConnectionRow {
  id: string;
  tenant_id: string;
  module_key: string;
  provider_key: string;
  display_name: string | null;
  environment: ProviderEnvironment;
  status: ProviderConnectionStatus;
  config_json: unknown;
  config_schema_version: number;
  version: number;
  last_test_status: ProviderTestStatus;
  last_tested_at: Date | string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  validation_mode: 'structural' | 'live' | string;
  live_validation_enabled: boolean;
  validation_timeout_ms: number;
  enabled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProviderSecretRow {
  secret_key: string;
  value_hash: string | null;
  last_four: string | null;
  secret_version: number;
  is_active: boolean;
  rotated_at: Date | string | null;
  expires_at: Date | string | null;
  last_used_at: Date | string | null;
}

export interface RegionalProfileView {
  tenantId: string;
  countryCode: string | null;
  profileKey: string;
  status: string;
  nationalIdentifierPolicy: string;
  phonePolicy: string;
  taxProfileKey: string | null;
  metadata: Record<string, unknown>;
  version: number;
  configuredAt: Date | string | null;
}

export interface ProviderReadiness {
  status: 'setup_required' | 'ready' | 'disabled' | 'invalid' | 'connection_failed';
  missing: string[];
  errors: string[];
}

export interface ProviderConfigurationView {
  providerKey: string;
  moduleKey: string;
  displayName: string;
  jurisdictionCode: string | null;
  configKeys: string[];
  moduleConfiguration: {
    moduleKey: string;
    config: Record<string, unknown>;
    version: number;
    validationStatus: string;
    validationErrors: string[];
  } | null;
  connection: {
    id: string;
    displayName: string | null;
    environment: ProviderEnvironment;
    status: ProviderConnectionStatus;
    config: Record<string, unknown>;
    version: number;
    lastTestStatus: ProviderTestStatus;
    lastTestedAt: Date | string | null;
    lastErrorCode: string | null;
    validationMode: 'structural' | 'live' | string;
    liveValidationEnabled: boolean;
    validationTimeoutMs: number;
    enabledAt: Date | string | null;
  } | null;
  secrets: Record<string, {
    configured: boolean;
    lastFour: string | null;
    version: number | null;
    rotatedAt: Date | string | null;
    expiresAt: Date | string | null;
  }>;
  readiness: ProviderReadiness;
  contract: ClinicProviderContract | null;
}

interface ConfigurationMutationContext {
  tenantId: string;
  actorId: string;
  ipAddress?: string;
  userAgent?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function providerDefinition(providerKey: string): ProviderDefinition {
  const definition = CLINIC_PROVIDER_DEFINITIONS.find((item) => item.providerKey === providerKey);
  if (!definition) throw new ValidationError(`Unsupported clinic provider: ${providerKey}`);
  return definition;
}

function normalizeConfig(definition: ProviderDefinition, config: Record<string, unknown>): Record<string, unknown> {
  const unknownKeys = Object.keys(config).filter((key) => !definition.configKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new ValidationError(`Unsupported ${definition.providerKey} configuration keys: ${unknownKeys.join(', ')}`);
  }

  for (const [key, value] of Object.entries(config)) {
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new ValidationError(`Provider configuration ${key} must be a scalar value`);
    }
  }
  return config;
}

function normalizeSecretKeys(definition: ProviderDefinition, secrets: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  const unknownKeys = Object.keys(secrets).filter((key) => !definition.secretKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new ValidationError(`Unsupported ${definition.providerKey} secret keys: ${unknownKeys.join(', ')}`);
  }
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ValidationError(`Provider secret ${key} must be a non-empty string`);
    }
    output[key] = value;
  }
  return output;
}

function mapRegionalProfile(row: RegionalProfileRow): RegionalProfileView {
  return {
    tenantId: row.tenant_id,
    countryCode: row.country_code,
    profileKey: row.profile_key,
    status: row.status,
    nationalIdentifierPolicy: row.national_identifier_policy,
    phonePolicy: row.phone_policy,
    taxProfileKey: row.tax_profile_key,
    metadata: asRecord(row.metadata_json),
    version: row.version,
    configuredAt: row.configured_at,
  };
}

export function redactProviderSecretMetadata(secret: {
  is_active?: boolean;
  last_four?: string | null;
  secret_version?: number | null;
  rotated_at?: Date | string | null;
  expires_at?: Date | string | null;
} | undefined) {
  return {
    configured: Boolean(secret?.is_active),
    lastFour: secret?.last_four || null,
    version: secret?.secret_version || null,
    rotatedAt: secret?.rotated_at || null,
    expiresAt: secret?.expires_at || null,
  };
}

function mapSecret(secret: ProviderSecretRow | undefined) {
  return redactProviderSecretMetadata(secret);
}

function mapModuleConfiguration(row: ModuleConfigurationRow | null) {
  if (!row) return null;
  const errors = Array.isArray(row.last_validation_errors)
    ? row.last_validation_errors.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    moduleKey: row.module_key,
    config: asRecord(row.config_json),
    version: row.version,
    validationStatus: row.last_validation_status,
    validationErrors: errors,
  };
}

function evaluateReadiness(
  definition: ProviderDefinition,
  connection: ProviderConnectionRow | null,
  moduleConfiguration: ModuleConfigurationRow | null,
  secrets: Map<string, ProviderSecretRow>,
  regionalProfile: RegionalProfileView,
): ProviderReadiness {
  if (!connection || connection.status === 'setup_required') {
    return { status: 'setup_required', missing: ['connection'], errors: [] };
  }
  if (connection.status === 'disabled') {
    return { status: 'disabled', missing: [], errors: [] };
  }
  if (connection.status === 'invalid') {
    return { status: 'invalid', missing: [], errors: [connection.last_error_message || 'Provider configuration is invalid'] };
  }
  if (connection.last_test_status === 'failed' && (connection.last_error_code?.endsWith('_configuration_invalid') || connection.last_error_code === 'provider_adapter_unsupported')) {
    return { status: 'invalid', missing: [], errors: [connection.last_error_message || 'Provider configuration is invalid'] };
  }
  if (connection.validation_mode === 'live' && connection.live_validation_enabled && connection.last_test_status === 'failed') {
    if (connection.last_error_code === 'live_validation_endpoint_missing') {
      return { status: 'setup_required', missing: ['config:validationEndpointUrl'], errors: [connection.last_error_message || 'Live validation endpoint is not configured'] };
    }
    if (connection.last_error_code?.startsWith('live_')) {
      return { status: 'connection_failed', missing: [], errors: [connection.last_error_message || 'Live validation failed'] };
    }
  }

  const config = asRecord(moduleConfiguration?.config_json ?? connection.config_json);
  const requiredConfigKeys = definition.configKeys.filter((key) => !definition.optionalConfigKeys?.includes(key));
  const missing = requiredConfigKeys
    .filter((key) => config[key] === undefined || config[key] === null || config[key] === '')
    .map((key) => `config:${key}`);
  const requiredSecretKeys = definition.requiredSecretKeys || definition.secretKeys;
  missing.push(...requiredSecretKeys.filter((key) => !secrets.get(key)?.is_active).map((key) => `secret:${key}`));
  for (const group of definition.secretGroups || []) {
    if (!group.some((key) => secrets.get(key)?.is_active)) {
      missing.push(`secret:any_of:${group.join('|')}`);
    }
  }

  const errors: string[] = [];
  if (definition.jurisdictionCode && regionalProfile.countryCode && regionalProfile.countryCode !== definition.jurisdictionCode) {
    errors.push(`${definition.providerKey} requires country ${definition.jurisdictionCode}`);
  }
  if (definition.jurisdictionCode && !regionalProfile.countryCode) {
    missing.push('regionalProfile.countryCode');
  }
  if (connection.last_test_status === 'failed') {
    return { status: 'connection_failed', missing, errors: [connection.last_error_message || 'Provider validation failed'] };
  }
  if (errors.length > 0) return { status: 'invalid', missing, errors };
  return { status: missing.length > 0 ? 'setup_required' : 'ready', missing, errors: [] };
}

async function loadRegionalProfile(tenantId: string, trx = db): Promise<RegionalProfileView> {
  const row = await trx('tenant_regional_profiles').where({ tenant_id: tenantId }).first() as RegionalProfileRow | undefined;
  if (row) return mapRegionalProfile(row);
  return {
    tenantId,
    countryCode: null,
    profileKey: 'generic',
    status: 'incomplete',
    nationalIdentifierPolicy: 'generic',
    phonePolicy: 'international_or_local',
    taxProfileKey: null,
    metadata: {},
    version: 0,
    configuredAt: null,
  };
}

async function loadModuleConfiguration(tenantId: string, moduleKey: string, trx = db): Promise<ModuleConfigurationRow | null> {
  return (await trx('tenant_module_configurations')
    .where({ tenant_id: tenantId, module_key: moduleKey })
    .first()) as ModuleConfigurationRow | undefined || null;
}

async function loadConnection(tenantId: string, providerKey: string, trx = db): Promise<ProviderConnectionRow | null> {
  return (await trx('tenant_provider_connections')
    .where({ tenant_id: tenantId, provider_key: providerKey })
    .first()) as ProviderConnectionRow | undefined || null;
}

async function loadSecrets(tenantId: string, providerKey: string, connectionId: string | null, trx = db): Promise<Map<string, ProviderSecretRow>> {
  const rows = await trx('clinic_integration_secrets')
    .where({ tenant_id: tenantId, provider: providerKey })
    .modify((query) => {
      if (connectionId) query.andWhere((builder) => builder.where({ connection_id: connectionId }).orWhereNull('connection_id'));
    })
    .select('secret_key', 'value_hash', 'last_four', 'secret_version', 'is_active', 'rotated_at', 'expires_at', 'last_used_at') as ProviderSecretRow[];
  return new Map(rows.map((row) => [row.secret_key, row]));
}

export async function getRegionalProfile(tenantId: string): Promise<RegionalProfileView> {
  return loadRegionalProfile(tenantId);
}

export async function updateRegionalProfile(input: ConfigurationMutationContext & {
  countryCode?: string | null;
  profileKey?: string;
  status?: 'incomplete' | 'configured' | 'invalid';
  nationalIdentifierPolicy?: string;
  phonePolicy?: string;
  taxProfileKey?: string | null;
  metadata?: Record<string, unknown>;
  expectedVersion?: number;
}): Promise<RegionalProfileView> {
  const countryCode = input.countryCode ? input.countryCode.trim().toUpperCase() : null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new ValidationError('countryCode must be an ISO 3166-1 alpha-2 code');
  const profileKey = input.profileKey?.trim() || 'generic';
  const status = input.status || 'incomplete';
  const metadata = input.metadata || {};
  if (Object.values(metadata).some((value) => typeof value === 'object' && value !== null)) {
    throw new ValidationError('Regional profile metadata must contain scalar values');
  }

  const result = await db.transaction(async (trx) => {
    const existing = await trx('tenant_regional_profiles').where({ tenant_id: input.tenantId }).first() as RegionalProfileRow | undefined;
    if (input.expectedVersion !== undefined && (existing?.version || 0) !== input.expectedVersion) {
      throw new ConflictError('Regional profile was changed by another administrator');
    }
    const now = trx.fn.now();
    const values = {
      tenant_id: input.tenantId,
      country_code: countryCode,
      profile_key: profileKey,
      status,
      national_identifier_policy: input.nationalIdentifierPolicy?.trim() || 'generic',
      phone_policy: input.phonePolicy?.trim() || 'international_or_local',
      tax_profile_key: input.taxProfileKey?.trim() || null,
      metadata_json: JSON.stringify(metadata),
      version: (existing?.version || 0) + 1,
      configured_by: input.actorId,
      configured_at: now,
      updated_at: now,
    };
    if (existing) {
      await trx('tenant_regional_profiles').where({ tenant_id: input.tenantId }).update(values);
    } else {
      await trx('tenant_regional_profiles').insert(values);
    }
    return loadRegionalProfile(input.tenantId, trx);
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'regional_profile.updated',
    entityType: 'tenant_regional_profile',
    entityId: input.tenantId,
    metadata: { countryCode, profileKey, status },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
  });
  return result;
}

export async function listProviderConfigurations(tenantId: string): Promise<ProviderConfigurationView[]> {
  const regionalProfile = await loadRegionalProfile(tenantId);
  return Promise.all(CLINIC_PROVIDER_DEFINITIONS.map(async (definition) => {
    const connection = await loadConnection(tenantId, definition.providerKey);
    const moduleConfiguration = definition.moduleConfigurationKey
      ? await loadModuleConfiguration(tenantId, definition.moduleConfigurationKey)
      : null;
    const secrets = await loadSecrets(tenantId, definition.providerKey, connection?.id || null);
    return {
      providerKey: definition.providerKey,
      moduleKey: definition.moduleKey,
      displayName: definition.displayName,
      jurisdictionCode: definition.jurisdictionCode || null,
      configKeys: [...definition.configKeys],
      moduleConfiguration: mapModuleConfiguration(moduleConfiguration),
      connection: connection ? {
        id: connection.id,
        displayName: connection.display_name,
        environment: connection.environment,
        status: connection.status,
        config: asRecord(connection.config_json),
        version: connection.version,
        lastTestStatus: connection.last_test_status,
        lastTestedAt: connection.last_tested_at,
        lastErrorCode: connection.last_error_code,
        validationMode: connection.validation_mode,
        liveValidationEnabled: connection.live_validation_enabled,
        validationTimeoutMs: connection.validation_timeout_ms,
        enabledAt: connection.enabled_at,
      } : null,
      secrets: Object.fromEntries(definition.secretKeys.map((key) => [key, mapSecret(secrets.get(key))])),
      readiness: evaluateReadiness(definition, connection, moduleConfiguration, secrets, regionalProfile),
      contract: getClinicProviderContract(definition.providerKey),
    } satisfies ProviderConfigurationView;
  }));
}

export async function updateProviderConfiguration(input: ConfigurationMutationContext & {
  providerKey: string;
  displayName?: string | null;
  environment?: ProviderEnvironment;
  config: Record<string, unknown>;
  expectedVersion?: number;
  expectedModuleVersion?: number;
  validationMode?: 'structural' | 'live';
  liveValidationEnabled?: boolean;
  validationTimeoutMs?: number;
}): Promise<ProviderConfigurationView> {
  const definition = providerDefinition(input.providerKey);
  const config = normalizeConfig(definition, input.config);
  if (input.validationMode && !['structural', 'live'].includes(input.validationMode)) {
    throw new ValidationError('Unsupported provider validation mode');
  }
  if (input.validationTimeoutMs !== undefined && (!Number.isInteger(input.validationTimeoutMs) || input.validationTimeoutMs < MIN_PROVIDER_VALIDATION_TIMEOUT_MS || input.validationTimeoutMs > MAX_PROVIDER_VALIDATION_TIMEOUT_MS)) {
    throw new ValidationError(`Provider validation timeout must be between ${MIN_PROVIDER_VALIDATION_TIMEOUT_MS} and ${MAX_PROVIDER_VALIDATION_TIMEOUT_MS} milliseconds`);
  }
  let effectiveValidationMode: 'structural' | 'live' = input.validationMode || 'structural';
  let effectiveLiveValidationEnabled = input.liveValidationEnabled ?? false;
  let effectiveValidationTimeoutMs = input.validationTimeoutMs ?? DEFAULT_PROVIDER_VALIDATION_TIMEOUT_MS;

  await db.transaction(async (trx) => {
    const existing = await trx('tenant_provider_connections')
      .where({ tenant_id: input.tenantId, provider_key: input.providerKey })
      .first() as ProviderConnectionRow | undefined;
    const existingModuleConfiguration = definition.moduleConfigurationKey
      ? await trx('tenant_module_configurations')
        .where({ tenant_id: input.tenantId, module_key: definition.moduleConfigurationKey })
        .first() as ModuleConfigurationRow | undefined
      : undefined;
    if (input.expectedVersion !== undefined && (existing?.version || 0) !== input.expectedVersion) {
      throw new ConflictError('Provider configuration was changed by another administrator');
    }
    if (input.expectedModuleVersion !== undefined && (existingModuleConfiguration?.version || 0) !== input.expectedModuleVersion) {
      throw new ConflictError('Module configuration was changed by another administrator');
    }
    effectiveValidationMode = input.validationMode || (existing?.validation_mode === 'live' ? 'live' : 'structural');
    effectiveLiveValidationEnabled = input.liveValidationEnabled ?? existing?.live_validation_enabled ?? false;
    effectiveValidationTimeoutMs = input.validationTimeoutMs ?? existing?.validation_timeout_ms ?? DEFAULT_PROVIDER_VALIDATION_TIMEOUT_MS;
    if (!Number.isInteger(effectiveValidationTimeoutMs) || effectiveValidationTimeoutMs < MIN_PROVIDER_VALIDATION_TIMEOUT_MS || effectiveValidationTimeoutMs > MAX_PROVIDER_VALIDATION_TIMEOUT_MS) {
      throw new ValidationError(`Provider validation timeout must be between ${MIN_PROVIDER_VALIDATION_TIMEOUT_MS} and ${MAX_PROVIDER_VALIDATION_TIMEOUT_MS} milliseconds`);
    }

    const now = trx.fn.now();
    const connectionValues = {
      tenant_id: input.tenantId,
      module_key: definition.moduleKey,
      provider_key: definition.providerKey,
      display_name: input.displayName?.trim() || null,
      environment: input.environment || existing?.environment || 'sandbox',
      status: existing?.status === 'disabled' ? 'disabled' : 'configured',
      config_json: definition.moduleConfigurationKey
        ? (existing?.config_json ? JSON.stringify(asRecord(existing.config_json)) : JSON.stringify({}))
        : JSON.stringify(config),
      config_schema_version: 1,
      version: (existing?.version || 0) + 1,
      last_test_status: 'not_tested',
      last_error_code: null,
      last_error_message: null,
      validation_mode: effectiveValidationMode,
      live_validation_enabled: effectiveLiveValidationEnabled,
      validation_timeout_ms: effectiveValidationTimeoutMs,
      updated_at: now,
    };
    if (existing) {
      await trx('tenant_provider_connections').where({ id: existing.id }).update(connectionValues);
    } else {
      await trx('tenant_provider_connections').insert(connectionValues);
    }

    if (definition.moduleConfigurationKey) {
      const missing = definition.configKeys
        .filter((key) => config[key] === undefined || config[key] === null || config[key] === '')
        .map((key) => `config:${key}`);
      const moduleValues = {
        tenant_id: input.tenantId,
        module_key: definition.moduleConfigurationKey,
        config_json: JSON.stringify(config),
        schema_version: 1,
        version: (existingModuleConfiguration?.version || 0) + 1,
        last_validation_status: missing.length > 0 ? 'incomplete' : 'valid',
        last_validation_errors: JSON.stringify(missing),
        validated_at: now,
        updated_by: input.actorId,
        updated_at: now,
      };
      if (existingModuleConfiguration) {
        await trx('tenant_module_configurations')
          .where({ tenant_id: input.tenantId, module_key: definition.moduleConfigurationKey })
          .update(moduleValues);
      } else {
        await trx('tenant_module_configurations').insert(moduleValues);
      }
    }
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'provider_configuration.updated',
    entityType: 'tenant_provider_connection',
    metadata: {
      providerKey: definition.providerKey,
      environment: input.environment || 'sandbox',
      configKeys: Object.keys(config),
      moduleConfigurationKey: definition.moduleConfigurationKey || null,
      validationMode: effectiveValidationMode,
      liveValidationEnabled: effectiveLiveValidationEnabled,
      validationTimeoutMs: effectiveValidationTimeoutMs,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
  });
  const result = (await listProviderConfigurations(input.tenantId)).find((item) => item.providerKey === definition.providerKey);
  if (!result) throw new NotFoundError('Provider configuration could not be reloaded');
  return result;
}

export async function updateProviderSecrets(input: ConfigurationMutationContext & {
  providerKey: string;
  secrets: Record<string, unknown>;
  clearKeys?: string[];
  expectedVersion?: number;
}): Promise<ProviderConfigurationView> {
  const definition = providerDefinition(input.providerKey);
  const secrets = normalizeSecretKeys(definition, input.secrets);
  const clearKeys = input.clearKeys || [];
  if (clearKeys.some((key) => !definition.secretKeys.includes(key))) {
    throw new ValidationError(`Unsupported ${definition.providerKey} secret keys in clearKeys`);
  }

  await db.transaction(async (trx) => {
    const connection = await trx('tenant_provider_connections')
      .where({ tenant_id: input.tenantId, provider_key: definition.providerKey })
      .first() as ProviderConnectionRow | undefined;
    if (!connection) throw new ValidationError('Save provider configuration before saving secrets');
    if (input.expectedVersion !== undefined && connection.version !== input.expectedVersion) {
      throw new ConflictError('Provider configuration was changed by another administrator');
    }

    const now = trx.fn.now();
    for (const key of clearKeys) {
      await trx('clinic_integration_secrets').where({
        tenant_id: input.tenantId,
        provider: definition.providerKey,
        secret_key: key,
      }).update({ is_active: false, rotated_at: now, rotated_by: input.actorId, updated_at: now });
    }
    for (const [key, value] of Object.entries(secrets)) {
      const encryptedValue = encryptField(value);
      await trx('clinic_integration_secrets')
        .insert({
          tenant_id: input.tenantId,
          provider: definition.providerKey,
          secret_key: key,
          connection_id: connection.id,
          encrypted_value: encryptedValue,
          value_hash: hashString(value),
          last_four: value.slice(-4),
          secret_version: 1,
          is_active: true,
          rotated_at: now,
          rotated_by: input.actorId,
          updated_at: now,
        })
        .onConflict(['tenant_id', 'provider', 'secret_key'])
        .merge({
          connection_id: connection.id,
          encrypted_value: encryptedValue,
          value_hash: hashString(value),
          last_four: value.slice(-4),
          secret_version: trx.raw('clinic_integration_secrets.secret_version + 1'),
          is_active: true,
          rotated_at: now,
          rotated_by: input.actorId,
          updated_at: now,
        });
    }
    await trx('tenant_provider_connections').where({ id: connection.id }).update({
      version: connection.version + 1,
      status: 'configured',
      last_test_status: 'not_tested',
      updated_at: now,
    });
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'provider_secrets.updated',
    entityType: 'clinic_integration_secret',
    metadata: { providerKey: definition.providerKey, updatedKeys: Object.keys(secrets), clearedKeys: clearKeys },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
  });
  const result = (await listProviderConfigurations(input.tenantId)).find((item) => item.providerKey === definition.providerKey);
  if (!result) throw new NotFoundError('Provider secrets could not be reloaded');
  return result;
}

export async function validateProviderConfiguration(input: ConfigurationMutationContext & { providerKey: string }): Promise<ProviderConfigurationView> {
  const definition = providerDefinition(input.providerKey);
  let result = (await listProviderConfigurations(input.tenantId)).find((item) => item.providerKey === definition.providerKey);
  if (!result) throw new NotFoundError('Provider configuration could not be loaded');

  const adapterResult = await validateClinicProviderAdapter(input.tenantId, definition.providerKey);
  if (result.connection && result.connection.status !== 'disabled') {
    await db('tenant_provider_connections').where({ id: result.connection.id }).update({
      last_test_status: 'not_tested',
      last_tested_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: db.fn.now(),
    });
    const fresh = (await listProviderConfigurations(input.tenantId)).find((item) => item.providerKey === definition.providerKey);
    if (fresh) result = fresh;
    const passed = result.readiness.status === 'ready' && adapterResult.status === 'ready';
    const connectionId = result.connection?.id;
    if (connectionId) {
      await db('tenant_provider_connections').where({ id: connectionId }).update({
        last_test_status: passed ? 'passed' : 'failed',
        last_tested_at: db.fn.now(),
        last_error_code: passed ? null : adapterResult.code,
        last_error_message: passed
          ? null
          : [adapterResult.message, ...adapterResult.missing, ...result.readiness.missing, ...result.readiness.errors].join(', ').slice(0, 500),
        updated_at: db.fn.now(),
      });
    }
    const tested = (await listProviderConfigurations(input.tenantId)).find((item) => item.providerKey === definition.providerKey);
    if (tested) result = tested;
  }

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'provider_configuration.validated',
    entityType: 'tenant_provider_connection',
    entityId: result.connection?.id,
    metadata: {
      providerKey: definition.providerKey,
      readiness: result.readiness,
      adapterStatus: adapterResult.status,
      adapterCode: adapterResult.code,
      testMode: adapterResult.testMode,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: result.readiness.status === 'ready' && adapterResult.status === 'ready' ? 'success' : 'failed',
  });
  return result;
}

export async function updateProviderSecret(input: ConfigurationMutationContext & {
  providerKey: string;
  secretKey: string;
  value: string;
  expectedVersion?: number;
}): Promise<ProviderConfigurationView> {
  return updateProviderSecrets({
    ...input,
    secrets: { [input.secretKey]: input.value },
    clearKeys: [],
  });
}

export async function revokeProviderSecret(input: ConfigurationMutationContext & {
  providerKey: string;
  secretKey: string;
  expectedVersion?: number;
}): Promise<ProviderConfigurationView> {
  return updateProviderSecrets({
    ...input,
    secrets: {},
    clearKeys: [input.secretKey],
  });
}
