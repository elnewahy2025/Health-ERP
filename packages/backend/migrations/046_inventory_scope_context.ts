import type { Knex } from 'knex';

/** Additive branch context for inventory warehouses; legacy warehouses remain tenant-scoped until assigned. */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('warehouses'))) return;
  if (!(await knex.schema.hasColumn('warehouses', 'branch_id'))) {
    await knex.schema.alterTable('warehouses', (table) => {
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.index(['tenant_id', 'branch_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('warehouses') && await knex.schema.hasColumn('warehouses', 'branch_id')) {
    await knex.schema.alterTable('warehouses', (table) => {
      table.dropIndex(['tenant_id', 'branch_id']);
      table.dropColumn('branch_id');
    });
  }
}
