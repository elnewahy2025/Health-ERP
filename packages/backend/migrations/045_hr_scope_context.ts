import type { Knex } from 'knex';

/** Additive HR scope context; legacy department text remains intact for compatibility. */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('employees'))) return;
  const hasDepartmentId = await knex.schema.hasColumn('employees', 'department_id');
  const hasBranchId = await knex.schema.hasColumn('employees', 'branch_id');
  if (!hasDepartmentId || !hasBranchId) {
    await knex.schema.alterTable('employees', (table) => {
      if (!hasDepartmentId) table.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
      if (!hasBranchId) table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
    });
  }
  if (!hasDepartmentId || !hasBranchId) {
    await knex.schema.alterTable('employees', (table) => {
      table.index(['tenant_id', 'department_id']);
      table.index(['tenant_id', 'branch_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('employees'))) return;
  const hasDepartmentId = await knex.schema.hasColumn('employees', 'department_id');
  const hasBranchId = await knex.schema.hasColumn('employees', 'branch_id');
  if (hasDepartmentId || hasBranchId) {
    await knex.schema.alterTable('employees', (table) => {
      if (hasDepartmentId) { table.dropIndex(['tenant_id', 'department_id']); table.dropColumn('department_id'); }
      if (hasBranchId) { table.dropIndex(['tenant_id', 'branch_id']); table.dropColumn('branch_id'); }
    });
  }
}
