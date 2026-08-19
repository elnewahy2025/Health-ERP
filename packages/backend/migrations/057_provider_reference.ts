import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('payment_transactions'))) return;
  if (!(await knex.schema.hasColumn('payment_transactions', 'provider_reference'))) {
    await knex.schema.table('payment_transactions', (table) => {
      table.string('provider_reference', 255).nullable();
      table.index(['tenant_id', 'provider_key', 'provider_reference'], 'payment_transactions_provider_external_ref_idx');
    });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: provider references are retained on rollback.
}
