import { decryptField, encryptField, hashString } from '@healthcare/shared/utils';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';

const SECRET_DEFINITIONS = {
  twilio: [
    { key: 'account_sid', legacyField: 'twilioAccountSid' },
    { key: 'auth_token', legacyField: 'twilioAuthToken' },
    { key: 'messaging_service_sid', legacyField: 'twilioMessagingServiceSid' },
    { key: 'whatsapp_number', legacyField: 'twilioWhatsAppNumber' },
    { key: 'voice_number', legacyField: 'twilioVoiceNumber' },
  ],
} as const;

type Provider = keyof typeof SECRET_DEFINITIONS;
type SecretDefinition = (typeof SECRET_DEFINITIONS)[Provider][number];

export interface ClinicIntegrationSecretSummary {
  provider: string;
  secretKey: string;
  configured: boolean;
  lastFour: string | null;
  updatedAt: string | Date | null;
}

function definitionFor(provider: string, secretKey: string): SecretDefinition | null {
  if (!(provider in SECRET_DEFINITIONS)) return null;
  return SECRET_DEFINITIONS[provider as Provider].find((definition) => definition.key === secretKey) || null;
}

export function isClinicIntegrationSecretKey(provider: string, secretKey: string): boolean {
  return definitionFor(provider, secretKey) !== null;
}

function summary(row: Record<string, unknown>): ClinicIntegrationSecretSummary {
  return {
    provider: String(row.provider),
    secretKey: String(row.secret_key),
    configured: typeof row.encrypted_value === 'string' && row.encrypted_value.length > 0,
    lastFour: typeof row.last_four === 'string' ? row.last_four : null,
    updatedAt: (row.updated_at as string | Date | null | undefined) ?? null,
  };
}

export async function listClinicIntegrationSecrets(
  tenantId: string,
  provider?: string,
): Promise<ClinicIntegrationSecretSummary[]> {
  let query = db('clinic_integration_secrets')
    .where({ tenant_id: tenantId })
    .select('provider', 'secret_key', 'encrypted_value', 'last_four', 'updated_at')
    .orderBy(['provider', 'secret_key']);
  if (provider) query = query.andWhere({ provider });
  const rows = await query;
  return rows.map((row: Record<string, unknown>) => summary(row));
}

export async function upsertClinicIntegrationSecret(input: {
  tenantId: string;
  actorId: string;
  provider: string;
  secretKey: string;
  value: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ClinicIntegrationSecretSummary> {
  const definition = definitionFor(input.provider, input.secretKey);
  if (!definition) throw new Error('Unsupported clinic integration secret');
  const encryptedValue = encryptField(input.value);
  const valueHash = hashString(input.value);
  const lastFour = input.value.slice(-4);

  const row = await db.transaction(async (trx) => {
    await trx('clinic_integration_secrets')
      .insert({
        tenant_id: input.tenantId,
        provider: input.provider,
        secret_key: input.secretKey,
        encrypted_value: encryptedValue,
        value_hash: valueHash,
        last_four: lastFour,
        updated_by: input.actorId,
      })
      .onConflict(['tenant_id', 'provider', 'secret_key'])
      .merge({
        encrypted_value: encryptedValue,
        value_hash: valueHash,
        last_four: lastFour,
        updated_by: input.actorId,
        updated_at: trx.fn.now(),
      });

    const tenant = await trx('tenants').where({ id: input.tenantId }).select('settings').first();
    const settings = tenant?.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings)
      ? { ...(tenant.settings as Record<string, unknown>) }
      : {};
    settings[definition.legacyField] = encryptedValue;
    await trx('tenants').where({ id: input.tenantId }).update({ settings, updated_at: trx.fn.now() });

    return trx('clinic_integration_secrets')
      .where({ tenant_id: input.tenantId, provider: input.provider, secret_key: input.secretKey })
      .select('provider', 'secret_key', 'encrypted_value', 'last_four', 'updated_at')
      .first();
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'clinic.integration_secret.updated',
    entityType: 'clinic_integration_secret',
    metadata: { provider: input.provider, secretKey: input.secretKey, configured: true, lastFour },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
  });
  return summary(row as Record<string, unknown>);
}

export async function clearClinicIntegrationSecret(input: {
  tenantId: string;
  actorId: string;
  provider: string;
  secretKey: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ClinicIntegrationSecretSummary> {
  const definition = definitionFor(input.provider, input.secretKey);
  if (!definition) throw new Error('Unsupported clinic integration secret');

  await db.transaction(async (trx) => {
    await trx('clinic_integration_secrets')
      .where({ tenant_id: input.tenantId, provider: input.provider, secret_key: input.secretKey })
      .delete();
    const tenant = await trx('tenants').where({ id: input.tenantId }).select('settings').first();
    const settings = tenant?.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings)
      ? { ...(tenant.settings as Record<string, unknown>) }
      : {};
    delete settings[definition.legacyField];
    await trx('tenants').where({ id: input.tenantId }).update({ settings, updated_at: trx.fn.now() });
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'clinic.integration_secret.cleared',
    entityType: 'clinic_integration_secret',
    metadata: { provider: input.provider, secretKey: input.secretKey, configured: false },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
  });
  return { provider: input.provider, secretKey: input.secretKey, configured: false, lastFour: null, updatedAt: null };
}

export async function getClinicIntegrationSecretValue(
  tenantId: string,
  provider: string,
  secretKey: string,
): Promise<string | null> {
  if (!definitionFor(provider, secretKey)) throw new Error('Unsupported clinic integration secret');
  const row = await db('clinic_integration_secrets')
    .where({ tenant_id: tenantId, provider, secret_key: secretKey })
    .select('encrypted_value')
    .first();
  if (!row?.encrypted_value) return null;
  return decryptField(String(row.encrypted_value));
}

export const clinicIntegrationSecretCatalog = SECRET_DEFINITIONS;
