import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('automation_rules'))) return;
  if (await knex.schema.hasColumn('automation_rules', 'trigger_event')) {
    await knex.raw('ALTER TABLE automation_rules ALTER COLUMN trigger_event DROP NOT NULL');
  }
  if (await knex.schema.hasColumn('automation_rules', 'action_type')) {
    await knex.raw('ALTER TABLE automation_rules ALTER COLUMN action_type DROP NOT NULL');
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: restoring legacy NOT NULL constraints would make valid manual rules impossible.
}
