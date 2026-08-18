import type { Knex } from 'knex';
import { encryptField, hashString } from '@healthcare/shared/utils';

const LEGACY_SECRET_FIELDS = [
  { field: 'twilioAccountSid', provider: 'twilio', key: 'account_sid' },
  { field: 'twilioAuthToken', provider: 'twilio', key: 'auth_token' },
  { field: 'twilioMessagingServiceSid', provider: 'twilio', key: 'messaging_service_sid' },
  { field: 'twilioWhatsAppNumber', provider: 'twilio', key: 'whatsapp_number' },
  { field: 'twilioVoiceNumber', provider: 'twilio', key: 'voice_number' },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('clinic_integration_secrets'))) {
    await knex.schema.createTable('clinic_integration_secrets', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('provider', 80).notNullable();
      table.string('secret_key', 120).notNullable();
      table.text('encrypted_value').notNullable();
      table.string('value_hash', 64).nullable();
      table.string('last_four', 4).nullable();
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'provider', 'secret_key'], { indexName: 'clinic_integration_secrets_unique' });
      table.index(['tenant_id', 'provider']);
    });
  }

  const tenants = await knex('tenants').select('id', 'settings');
  for (const tenant of tenants) {
    const settings = asRecord(tenant.settings);
    let changed = false;

    for (const definition of LEGACY_SECRET_FIELDS) {
      const raw = settings[definition.field];
      if (typeof raw !== 'string' || raw.length === 0) continue;

      const existing = await knex('clinic_integration_secrets')
        .where({
          tenant_id: tenant.id,
          provider: definition.provider,
          secret_key: definition.key,
        })
        .select('encrypted_value')
        .first();
      const alreadyMigrated = existing?.encrypted_value === raw;
      if (!alreadyMigrated && !process.env.ENCRYPTION_KEY) {
        throw new Error(`ENCRYPTION_KEY is required to migrate ${definition.provider}.${definition.key}`);
      }
      const encryptedValue = alreadyMigrated ? raw : encryptField(raw);
      const valueHash = alreadyMigrated ? null : hashString(raw);
      const lastFour = alreadyMigrated ? null : raw.slice(-4);

      await knex('clinic_integration_secrets')
        .insert({
          tenant_id: tenant.id,
          provider: definition.provider,
          secret_key: definition.key,
          encrypted_value: encryptedValue,
          value_hash: valueHash,
          last_four: lastFour,
        })
        .onConflict(['tenant_id', 'provider', 'secret_key'])
        .merge({
          encrypted_value: encryptedValue,
          value_hash: valueHash,
          last_four: lastFour,
          updated_at: knex.fn.now(),
        });

      if (!alreadyMigrated) {
        settings[definition.field] = encryptedValue;
        changed = true;
      }
    }

    if (changed) {
      await knex('tenants').where({ id: tenant.id }).update({
        settings: JSON.stringify(settings),
        updated_at: knex.fn.now(),
      });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: encrypted integration secrets are not deleted by rollback.
}
