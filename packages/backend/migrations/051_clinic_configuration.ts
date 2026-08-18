import type { Knex } from 'knex';
import { CLINIC_CORE_MODULES } from '@healthcare/shared';

const LEGACY_SETTING_KEYS: Record<string, string> = {
  clinicName: 'clinic.profile.display_name',
  logoUrl: 'clinic.profile.logo_url',
  landPhone: 'clinic.contact.land_phone',
  whatsappPhone: 'clinic.contact.whatsapp_phone',
  email: 'clinic.contact.email',
  website: 'clinic.contact.website',
  address: 'clinic.address.street',
  city: 'clinic.address.city',
  country: 'clinic.address.country',
  googleMapsLocation: 'clinic.address.maps_url',
  licenseNumber: 'clinic.legal.license_number',
  taxNumber: 'clinic.legal.tax_number',
};

const CORE_MODULES = [...CLINIC_CORE_MODULES];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('clinic_config_entries'))) {
    await knex.schema.createTable('clinic_config_entries', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('scope_type', 20).notNullable();
      table.uuid('scope_id').notNullable();
      table.string('key', 160).notNullable();
      table.jsonb('value_json').notNullable();
      table.integer('version').notNullable().defaultTo(1);
      table.timestamp('effective_from').nullable();
      table.timestamp('effective_to').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'scope_type', 'scope_id', 'key'], {
        indexName: 'clinic_config_entries_scope_key_unique',
      });
      table.index(['tenant_id', 'scope_type', 'scope_id']);
      table.index(['tenant_id', 'key']);
    });
  }

  if (!(await knex.schema.hasTable('tenant_module_entitlements'))) {
    await knex.schema.createTable('tenant_module_entitlements', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('module_key', 80).notNullable();
      table.string('status', 20).notNullable().defaultTo('available');
      table.string('source', 120).nullable();
      table.timestamp('starts_at').nullable();
      table.timestamp('expires_at').nullable();
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'module_key'], { indexName: 'tenant_module_entitlements_unique' });
      table.index(['tenant_id', 'status']);
    });
  }

  if (!(await knex.schema.hasTable('tenant_module_activations'))) {
    await knex.schema.createTable('tenant_module_activations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('module_key', 80).notNullable();
      table.string('status', 20).notNullable().defaultTo('setup_required');
      table.uuid('activated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('activated_at').nullable();
      table.uuid('disabled_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('disabled_at').nullable();
      table.integer('config_version').nullable();
      table.string('last_validation_status', 20).notNullable().defaultTo('incomplete');
      table.jsonb('last_validation_errors').notNullable().defaultTo('[]');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'module_key'], { indexName: 'tenant_module_activations_unique' });
      table.index(['tenant_id', 'status']);
    });
  }

  const tenants = await knex('tenants').select('id', 'name', 'settings');
  for (const tenant of tenants) {
    const legacy = isRecord(tenant.settings) ? tenant.settings : {};
    const entries = Object.entries(LEGACY_SETTING_KEYS)
      .map(([legacyKey, configurationKey]) => {
        const value = legacy[legacyKey] ?? (legacyKey === 'clinicName' ? tenant.name : undefined);
        if (value === undefined || value === null) return null;
        return {
          tenant_id: tenant.id,
          scope_type: 'tenant',
          scope_id: tenant.id,
          key: configurationKey,
          value_json: JSON.stringify(value),
          version: 1,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (entries.length > 0) {
      await knex('clinic_config_entries')
        .insert(entries)
        .onConflict(['tenant_id', 'scope_type', 'scope_id', 'key'])
        .ignore();
    }

    const entitlementRows = CORE_MODULES.map((moduleKey) => ({
      tenant_id: tenant.id,
      module_key: moduleKey,
      status: 'available',
      source: 'core',
    }));
    await knex('tenant_module_entitlements')
      .insert(entitlementRows)
      .onConflict(['tenant_id', 'module_key'])
      .ignore();

    const activationRows = CORE_MODULES.map((moduleKey) => ({
      tenant_id: tenant.id,
      module_key: moduleKey,
      status: 'enabled',
      last_validation_status: 'incomplete',
      last_validation_errors: JSON.stringify([]),
    }));
    await knex('tenant_module_activations')
      .insert(activationRows)
      .onConflict(['tenant_id', 'module_key'])
      .ignore();
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe migration: do not delete tenant configuration or entitlements.
}
