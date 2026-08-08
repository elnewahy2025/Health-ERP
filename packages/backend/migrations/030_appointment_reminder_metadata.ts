import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Reminder service (reminder.service.ts) reads/writes appointments.metadata->>'reminder_sent',
  // but 001_initial_schema created `reminders` (jsonb) + `reminder_sent` (boolean) instead.
  // Add the jsonb column the code expects and backfill it from the legacy columns.

  const hasTable = await knex.schema.hasTable('appointments');
  if (!hasTable) return;

  const columns = await knex.raw("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments'");
  const existingCols = columns.rows.map((r: { column_name: string }) => r.column_name);

  if (!existingCols.includes('metadata')) {
    await knex.schema.alterTable('appointments', (table) => {
      table.jsonb('metadata').defaultTo('{}');
    });
  }

  if (existingCols.includes('reminder_sent') && existingCols.includes('metadata')) {
    await knex.raw(
      `UPDATE appointments SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reminder_sent}', to_jsonb(reminder_sent::text)) WHERE reminder_sent IS NOT NULL AND COALESCE(metadata->>'reminder_sent', '') = ''`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('appointments');
  if (!hasTable) return;
  const columns = await knex.raw("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments'");
  const existingCols = columns.rows.map((r: { column_name: string }) => r.column_name);
  if (existingCols.includes('metadata')) {
    await knex.schema.alterTable('appointments', (table) => {
      table.dropColumn('metadata');
    });
  }
}
