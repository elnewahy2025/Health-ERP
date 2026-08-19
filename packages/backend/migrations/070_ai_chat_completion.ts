import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('ai_requests'))) return;

  if (!(await knex.schema.hasColumn('ai_requests', 'error_code'))) {
    await knex.schema.alterTable('ai_requests', (table) => {
      table.string('error_code', 120).nullable();
    });
  }
  if (!(await knex.schema.hasColumn('ai_requests', 'idempotency_key'))) {
    await knex.schema.alterTable('ai_requests', (table) => {
      table.string('idempotency_key', 180).nullable();
    });
  }

  await knex.raw("ALTER TABLE ai_requests ALTER COLUMN status SET DEFAULT 'pending'");
  await knex('ai_requests')
    .where({ status: 'completed' })
    .whereNull('response')
    .update({ status: 'failed', error_code: 'COMPLETION_NOT_EXECUTED', error: 'AI completion was not executed' });

  const indexLookup = await knex.raw(
    "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ? LIMIT 1",
    ['ai_requests_tenant_idempotency_uq'],
  );
  if (indexLookup.rows.length === 0) {
    await knex.raw(
      'CREATE UNIQUE INDEX ai_requests_tenant_idempotency_uq ON ai_requests (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL',
    );
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: retain truthful AI request state and replay evidence on rollback.
}
