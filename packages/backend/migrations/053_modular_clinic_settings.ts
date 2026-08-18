import type { Knex } from 'knex';

const EMPTY_JSON = (knex: Knex) => knex.raw("'{}'::jsonb");
const EMPTY_ARRAY_JSON = (knex: Knex) => knex.raw("'[]'::jsonb");

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('tenant_regional_profiles'))) {
    await knex.schema.createTable('tenant_regional_profiles', (table) => {
      table.uuid('tenant_id').primary().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('country_code', 2).nullable();
      table.string('profile_key', 80).notNullable().defaultTo('generic');
      table.string('status', 20).notNullable().defaultTo('incomplete');
      table.string('national_identifier_policy', 80).notNullable().defaultTo('generic');
      table.string('phone_policy', 80).notNullable().defaultTo('international_or_local');
      table.string('tax_profile_key', 80).nullable();
      table.jsonb('metadata_json').notNullable().defaultTo(EMPTY_JSON(knex));
      table.integer('version').notNullable().defaultTo(1);
      table.uuid('configured_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('configured_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['country_code', 'profile_key']);
      table.index(['status']);
    });
  }

  if (!(await knex.schema.hasTable('tenant_module_configurations'))) {
    await knex.schema.createTable('tenant_module_configurations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('module_key', 80).notNullable();
      table.jsonb('config_json').notNullable().defaultTo(EMPTY_JSON(knex));
      table.integer('schema_version').notNullable().defaultTo(1);
      table.integer('version').notNullable().defaultTo(1);
      table.string('last_validation_status', 24).notNullable().defaultTo('incomplete');
      table.jsonb('last_validation_errors').notNullable().defaultTo(EMPTY_ARRAY_JSON(knex));
      table.timestamp('validated_at').nullable();
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'module_key'], { indexName: 'tenant_module_configurations_unique' });
      table.index(['tenant_id', 'last_validation_status']);
    });
  }

  if (!(await knex.schema.hasTable('tenant_provider_connections'))) {
    await knex.schema.createTable('tenant_provider_connections', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('module_key', 80).notNullable();
      table.string('provider_key', 80).notNullable();
      table.string('display_name', 160).nullable();
      table.string('environment', 20).notNullable().defaultTo('sandbox');
      table.string('status', 24).notNullable().defaultTo('setup_required');
      table.jsonb('config_json').notNullable().defaultTo(EMPTY_JSON(knex));
      table.integer('config_schema_version').notNullable().defaultTo(1);
      table.integer('version').notNullable().defaultTo(1);
      table.string('last_test_status', 24).notNullable().defaultTo('not_tested');
      table.timestamp('last_tested_at').nullable();
      table.string('last_error_code', 120).nullable();
      table.text('last_error_message').nullable();
      table.uuid('enabled_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('enabled_at').nullable();
      table.uuid('disabled_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('disabled_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'provider_key'], { indexName: 'tenant_provider_connections_unique' });
      table.index(['tenant_id', 'module_key']);
      table.index(['tenant_id', 'status']);
    });
  }

  const activationColumns: Array<[string, (table: Knex.AlterTableBuilder) => void]> = [
    ['last_validated_at', (table) => table.timestamp('last_validated_at').nullable()],
    ['readiness_version', (table) => table.integer('readiness_version').notNullable().defaultTo(1)],
    ['setup_completed_at', (table) => table.timestamp('setup_completed_at').nullable()],
    ['setup_completed_by', (table) => table.uuid('setup_completed_by').nullable().references('id').inTable('users').onDelete('SET NULL')],
  ];
  for (const [column, add] of activationColumns) {
    if (!(await knex.schema.hasColumn('tenant_module_activations', column))) {
      await knex.schema.table('tenant_module_activations', add);
    }
  }

  const secretColumns: Array<[string, (table: Knex.AlterTableBuilder) => void]> = [
    ['connection_id', (table) => table.uuid('connection_id').nullable().references('id').inTable('tenant_provider_connections').onDelete('CASCADE')],
    ['secret_version', (table) => table.integer('secret_version').notNullable().defaultTo(1)],
    ['is_active', (table) => table.boolean('is_active').notNullable().defaultTo(true)],
    ['rotated_at', (table) => table.timestamp('rotated_at').nullable()],
    ['rotated_by', (table) => table.uuid('rotated_by').nullable().references('id').inTable('users').onDelete('SET NULL')],
    ['expires_at', (table) => table.timestamp('expires_at').nullable()],
    ['last_used_at', (table) => table.timestamp('last_used_at').nullable()],
  ];
  for (const [column, add] of secretColumns) {
    if (!(await knex.schema.hasColumn('clinic_integration_secrets', column))) {
      await knex.schema.table('clinic_integration_secrets', add);
    }
  }

  const auditColumns: Array<[string, (table: Knex.AlterTableBuilder) => void]> = [
    ['module_key', (table) => table.string('module_key', 80).nullable()],
    ['provider_key', (table) => table.string('provider_key', 80).nullable()],
    ['scope_type', (table) => table.string('scope_type', 20).nullable()],
    ['scope_id', (table) => table.uuid('scope_id').nullable()],
    ['request_id', (table) => table.string('request_id', 120).nullable()],
  ];
  for (const [column, add] of auditColumns) {
    if (!(await knex.schema.hasColumn('audit_logs', column))) {
      await knex.schema.table('audit_logs', add);
    }
  }

  const tenants = await knex('tenants').select('id');
  for (const tenant of tenants) {
    await knex('tenant_regional_profiles')
      .insert({ tenant_id: tenant.id })
      .onConflict('tenant_id')
      .ignore();
  }

  if (await knex.schema.hasTable('clinic_integration_secrets')) {
    const providers = await knex('clinic_integration_secrets')
      .distinct('tenant_id', 'provider')
      .whereNotNull('provider');

    for (const provider of providers) {
      const [connection] = await knex('tenant_provider_connections')
        .insert({
          tenant_id: provider.tenant_id,
          module_key: 'integrations',
          provider_key: provider.provider,
          status: 'configured',
        })
        .onConflict(['tenant_id', 'provider_key'])
        .ignore()
        .returning(['id']);

      const connectionRow = connection || await knex('tenant_provider_connections')
        .where({ tenant_id: provider.tenant_id, provider_key: provider.provider })
        .select('id')
        .first();

      if (connectionRow) {
        await knex('clinic_integration_secrets')
          .where({ tenant_id: provider.tenant_id, provider: provider.provider })
          .whereNull('connection_id')
          .update({ connection_id: connectionRow.id, updated_at: knex.fn.now() });
      }
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe migration: tenant configuration, provider links, secrets, and audit history are never deleted by rollback.
}
