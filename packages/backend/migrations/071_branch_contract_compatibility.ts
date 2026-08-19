import type { Knex } from 'knex';

/**
 * The multi-branch module and frontend expose operational branch attributes that
 * were not present in the original branches table. Add them incrementally so
 * existing installations can run the module without destructive recreation.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('branches'))) return;

  const additions: Array<{ column: string; add: (table: Knex.CreateTableBuilder) => void }> = [
    { column: 'name_ar', add: (table) => table.string('name_ar', 200).nullable() },
    { column: 'city', add: (table) => table.string('city', 120).nullable() },
    { column: 'governorate', add: (table) => table.string('governorate', 120).nullable() },
    { column: 'manager_name', add: (table) => table.string('manager_name', 200).nullable() },
    { column: 'is_active', add: (table) => table.boolean('is_active').defaultTo(true).nullable() },
    { column: 'latitude', add: (table) => table.decimal('latitude', 10, 7).nullable() },
    { column: 'longitude', add: (table) => table.decimal('longitude', 10, 7).nullable() },
    { column: 'working_hours', add: (table) => table.jsonb('working_hours').nullable() },
    { column: 'capacity', add: (table) => table.integer('capacity').nullable() },
    { column: 'type', add: (table) => table.string('type', 30).defaultTo('branch').nullable() },
  ];

  for (const addition of additions) {
    if (!(await knex.schema.hasColumn('branches', addition.column))) {
      await knex.schema.alterTable('branches', (table) => addition.add(table));
    }
  }

  // Keep legacy status and the operational is_active flag truthful for rows
  // created before the multi-branch module introduced is_active.
  await knex('branches').whereNull('is_active').update({ is_active: true });
  await knex('branches').whereIn('status', ['inactive', 'disabled', 'archived']).update({ is_active: false });
  await knex('branches').whereNull('type').update({ type: 'branch' });

  // The UI treats phone as optional; retain existing values but allow a branch
  // to be created before contact details are completed in Settings.
  await knex.raw('ALTER TABLE branches ALTER COLUMN phone DROP NOT NULL');
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: retain operational branch data on rollback.
}

// Knex's schema builder callback accepts a TableBuilder, while this alias keeps
// each idempotent addition strongly typed without duplicating migration logic.
export type BranchTableBuilder = Knex.CreateTableBuilder;
