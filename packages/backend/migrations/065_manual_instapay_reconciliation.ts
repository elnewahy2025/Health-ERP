import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('manual_instapay_reconciliations'))) {
    await knex.schema.createTable('manual_instapay_reconciliations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
      table.uuid('payment_transaction_id').notNullable().references('id').inTable('payment_transactions').onDelete('CASCADE');
      table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
      table.uuid('verified_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('local_reference', 100).notNullable();
      table.string('status', 32).notNullable().defaultTo('awaiting_transfer');
      table.decimal('requested_amount', 14, 2).notNullable();
      table.decimal('received_amount', 14, 2).nullable();
      table.string('currency', 3).notNullable();
      table.text('wallet_identifier').notNullable();
      table.string('account_name', 200).notNullable();
      table.string('instructions', 2000).notNullable();
      table.string('external_reference', 255).nullable();
      table.date('transfer_date').nullable();
      table.text('decision_notes').nullable();
      table.timestamp('verified_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'local_reference'], 'manual_instapay_reconciliations_local_ref_uq');
      table.index(['tenant_id', 'invoice_id', 'status'], 'manual_instapay_reconciliations_invoice_status_idx');
      table.index(['tenant_id', 'status', 'created_at'], 'manual_instapay_reconciliations_status_idx');
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS manual_instapay_reconciliations_external_ref_uq
      ON manual_instapay_reconciliations (tenant_id, external_reference)
      WHERE external_reference IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS manual_instapay_reconciliations_pending_invoice_uq
      ON manual_instapay_reconciliations (tenant_id, invoice_id)
      WHERE status = 'awaiting_transfer'
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: manual reconciliation evidence is retained on rollback.
}
