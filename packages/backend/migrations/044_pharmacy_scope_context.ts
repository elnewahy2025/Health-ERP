import type { Knex } from 'knex';

/** Additive branch context for pharmacy inventory; existing rows remain tenant-scoped until assigned. */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('pharmacy_inventory')) {
    const hasBranchId = await knex.schema.hasColumn('pharmacy_inventory', 'branch_id');
    if (!hasBranchId) {
      await knex.schema.alterTable('pharmacy_inventory', (table) => {
        table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
        table.index(['tenant_id', 'branch_id']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('pharmacy_inventory') && await knex.schema.hasColumn('pharmacy_inventory', 'branch_id')) {
    await knex.schema.alterTable('pharmacy_inventory', (table) => {
      table.dropIndex(['tenant_id', 'branch_id']);
      table.dropColumn('branch_id');
    });
  }
}
