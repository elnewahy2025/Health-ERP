import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('payment_transactions'))) return;

  if (!(await knex.schema.hasColumn('payment_transactions', 'provider_key'))) {
    await knex.schema.table('payment_transactions', (table) => {
      table.string('provider_key', 50).nullable();
      table.index(['tenant_id', 'provider_key', 'status'], 'payment_transactions_provider_status_idx');
    });
  }

  // Backfill only unambiguous legacy provider rows. Internal payments remain null.
  await knex('payment_transactions')
    .whereNull('provider_key')
    .andWhere((query) => {
      query.where('method', 'fawry').orWhere('notes', 'Stripe checkout');
    })
    .update({
      provider_key: knex.raw("CASE WHEN method = 'fawry' THEN 'fawry' WHEN notes = 'Stripe checkout' THEN 'stripe' ELSE NULL END"),
    });
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: provider status history is retained on rollback.
}
