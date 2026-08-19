import type { Knex } from 'knex';

const EMPTY_JSON = (knex: Knex) => knex.raw("'{}'::jsonb");

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('provider_verification_runs'))) {
    await knex.schema.createTable('provider_verification_runs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('provider_connection_id').nullable().references('id').inTable('tenant_provider_connections').onDelete('SET NULL');
      table.string('provider_key', 80).notNullable();
      table.string('environment', 20).notNullable();
      table.string('verification_type', 80).notNullable();
      table.string('idempotency_key', 180).notNullable();
      table.string('status', 24).notNullable().defaultTo('queued');
      table.string('result_code', 120).nullable();
      table.text('message').nullable();
      table.jsonb('evidence_json').notNullable().defaultTo(EMPTY_JSON(knex));
      table.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('request_id', 120).nullable();
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('expires_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'provider_key', 'environment', 'verification_type', 'idempotency_key'], { indexName: 'provider_verification_runs_idempotency_uq' });
      table.index(['tenant_id', 'provider_key', 'status', 'created_at'], 'provider_verification_runs_status_idx');
      table.index(['tenant_id', 'provider_key', 'environment', 'verification_type', 'completed_at'], 'provider_verification_runs_latest_idx');
    });
  }

  if (await knex.schema.hasTable('payment_transactions')) {
    if (!(await knex.schema.hasColumn('payment_transactions', 'idempotency_key'))) {
      await knex.schema.alterTable('payment_transactions', (table) => {
        table.string('idempotency_key', 180).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('payment_transactions', 'provider_environment'))) {
      await knex.schema.alterTable('payment_transactions', (table) => {
        table.string('provider_environment', 20).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('payment_transactions', 'provider_url'))) {
      await knex.schema.alterTable('payment_transactions', (table) => {
        table.text('provider_url').nullable();
      });
    }
    if (!(await knex.schema.hasColumn('payment_transactions', 'provider_currency'))) {
      await knex.schema.alterTable('payment_transactions', (table) => {
        table.string('provider_currency', 3).nullable();
      });
    }
    const indexLookup = await knex.raw(
      "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ? LIMIT 1",
      ['payment_transactions_provider_idempotency_uq'],
    );
    if (indexLookup.rows.length === 0) {
      await knex.raw(
        "CREATE UNIQUE INDEX payment_transactions_provider_idempotency_uq ON payment_transactions (tenant_id, provider_key, idempotency_key) WHERE provider_key IS NOT NULL AND idempotency_key IS NOT NULL",
      );
    }
    const environmentIndexLookup = await knex.raw(
      "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ? LIMIT 1",
      ['payment_transactions_provider_environment_idx'],
    );
    if (environmentIndexLookup.rows.length === 0) {
      await knex.schema.alterTable('payment_transactions', (table) => {
        table.index(['tenant_id', 'provider_key', 'provider_environment', 'status'], 'payment_transactions_provider_environment_idx');
      });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: verification evidence and payment idempotency history are retained on rollback.
}
