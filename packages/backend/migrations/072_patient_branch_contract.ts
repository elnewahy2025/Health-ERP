import type { Knex } from 'knex';

/**
 * Patient records participate in branch-scoped authorization across clinical,
 * pharmacy, billing, and operational modules. Keep the field nullable for
 * existing records; new API-created patients must receive a validated branch
 * whenever the actor's effective permission scope requires one.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('patients'))) return;

  if (!(await knex.schema.hasColumn('patients', 'branch_id'))) {
    await knex.schema.alterTable('patients', (table) => {
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.index(['tenant_id', 'branch_id'], 'patients_tenant_branch_idx');
    });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: retaining branch ownership avoids silently broadening access
  // when an installation rolls back application code without rolling back data.
}
