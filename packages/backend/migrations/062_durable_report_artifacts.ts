import type { Knex } from 'knex';

async function addColumn(knex: Knex, column: string, definition: (table: Knex.CreateTableBuilder) => void): Promise<void> {
  if (!(await knex.schema.hasColumn('report_executions', column))) {
    await knex.schema.alterTable('report_executions', definition);
  }
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('report_executions'))) return;
  await addColumn(knex, 'params', (table) => table.jsonb('params').defaultTo('{}'));
  await addColumn(knex, 'scope_context', (table) => table.jsonb('scope_context').defaultTo('{}'));
  await addColumn(knex, 'storage_location', (table) => table.string('storage_location', 500).nullable());
  await addColumn(knex, 'checksum', (table) => table.string('checksum', 128).nullable());
  await addColumn(knex, 'file_size', (table) => table.bigInteger('file_size').nullable());
  await addColumn(knex, 'mime_type', (table) => table.string('mime_type', 150).nullable());
  await addColumn(knex, 'file_name', (table) => table.string('file_name', 255).nullable());
  await addColumn(knex, 'retention_days', (table) => table.integer('retention_days').notNullable().defaultTo(7));
  await addColumn(knex, 'artifact_expires_at', (table) => table.timestamp('artifact_expires_at').nullable());
  await addColumn(knex, 'artifact_deleted_at', (table) => table.timestamp('artifact_deleted_at').nullable());
  await addColumn(knex, 'updated_at', (table) => table.timestamp('updated_at').defaultTo(knex.fn.now()));
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_report_executions_artifact_retention ON report_executions (status, artifact_expires_at, artifact_deleted_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_report_executions_pending ON report_executions (status, created_at)');
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('report_executions'))) return;
  await knex.raw('DROP INDEX IF EXISTS idx_report_executions_artifact_retention');
  await knex.raw('DROP INDEX IF EXISTS idx_report_executions_pending');
  const columns = ['params', 'scope_context', 'storage_location', 'checksum', 'file_size', 'mime_type', 'file_name', 'retention_days', 'artifact_expires_at', 'artifact_deleted_at', 'updated_at'];
  const existing = (await Promise.all(columns.map(async (column) => [column, await knex.schema.hasColumn('report_executions', column)] as const))).filter(([, has]) => has).map(([column]) => column);
  if (existing.length > 0) await knex.schema.alterTable('report_executions', (table) => existing.forEach((column) => table.dropColumn(column)));
}
