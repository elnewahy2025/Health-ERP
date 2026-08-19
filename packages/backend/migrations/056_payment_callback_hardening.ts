import type { Knex } from 'knex';

/** Additive payment callback state support; existing payment history is preserved. */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('payment_transactions'))) return;

  const hasUpdatedAt = await knex.schema.hasColumn('payment_transactions', 'updated_at');
  if (!hasUpdatedAt) {
    await knex.schema.alterTable('payment_transactions', (table) => {
      table.timestamp('updated_at').nullable();
    });
    await knex('payment_transactions').whereNull('updated_at').update({ updated_at: knex.ref('created_at') });
  }

  const indexLookup = await knex.raw(
    "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ? LIMIT 1",
    ['payment_transactions_provider_reference_idx'],
  );
  const hasProviderReferenceIndex = indexLookup.rows.length > 0;
  if (!hasProviderReferenceIndex) {
    await knex.schema.alterTable('payment_transactions', (table) => {
      table.index(['tenant_id', 'provider_key', 'reference'], 'payment_transactions_provider_reference_idx');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Preserve payment history and callback state on rollback. The migration is intentionally non-destructive.
  void knex;
}
