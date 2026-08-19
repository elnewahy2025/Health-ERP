import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('eta_invoices') && !(await knex.schema.hasColumn('eta_invoices', 'internal_id'))) {
    await knex.schema.alterTable('eta_invoices', (table) => table.string('internal_id', 160).nullable());
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('eta_invoices') && await knex.schema.hasColumn('eta_invoices', 'internal_id')) {
    await knex.schema.alterTable('eta_invoices', (table) => table.dropColumn('internal_id'));
  }
}
