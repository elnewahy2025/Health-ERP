import type { Knex } from 'knex';

/** Additive scope context for report definitions; legacy rows remain tenant-wide until assigned. */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('report_definitions'))) return;
  const hasBranch = await knex.schema.hasColumn('report_definitions', 'branch_id');
  const hasDepartment = await knex.schema.hasColumn('report_definitions', 'department_id');
  if (!hasBranch || !hasDepartment) {
    await knex.schema.alterTable('report_definitions', (table) => {
      if (!hasBranch) table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      if (!hasDepartment) table.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('report_definitions'))) return;
  const hasBranch = await knex.schema.hasColumn('report_definitions', 'branch_id');
  const hasDepartment = await knex.schema.hasColumn('report_definitions', 'department_id');
  if (hasBranch || hasDepartment) {
    await knex.schema.alterTable('report_definitions', (table) => {
      if (hasBranch) table.dropColumn('branch_id');
      if (hasDepartment) table.dropColumn('department_id');
    });
  }
}
