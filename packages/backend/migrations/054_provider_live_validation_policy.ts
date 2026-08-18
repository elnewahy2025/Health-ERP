import type { Knex } from 'knex';

const DEFAULT_TIMEOUT_MS = 5000;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('tenant_provider_connections'))) return;

  const columns: Array<[string, (table: Knex.AlterTableBuilder) => void]> = [
    ['validation_mode', (table) => table.string('validation_mode', 24).notNullable().defaultTo('structural')],
    ['live_validation_enabled', (table) => table.boolean('live_validation_enabled').notNullable().defaultTo(false)],
    ['validation_timeout_ms', (table) => table.integer('validation_timeout_ms').notNullable().defaultTo(DEFAULT_TIMEOUT_MS)],
  ];

  for (const [column, add] of columns) {
    if (!(await knex.schema.hasColumn('tenant_provider_connections', column))) {
      await knex.schema.table('tenant_provider_connections', add);
    }
  }

  await knex('tenant_provider_connections')
    .whereNull('validation_mode')
    .update({ validation_mode: 'structural' });
  await knex('tenant_provider_connections')
    .whereNull('live_validation_enabled')
    .update({ live_validation_enabled: false });
  await knex('tenant_provider_connections')
    .whereNull('validation_timeout_ms')
    .update({ validation_timeout_ms: DEFAULT_TIMEOUT_MS });
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: validation policy and provider history are preserved on rollback.
}
