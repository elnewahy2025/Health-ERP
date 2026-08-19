import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('export_jobs'))) return;

  const addColumn = async (
    columnName: string,
    callback: (table: Knex.AlterTableBuilder) => void,
  ): Promise<void> => {
    if (!(await knex.schema.hasColumn('export_jobs', columnName))) {
      await knex.schema.alterTable('export_jobs', callback);
    }
  };

  await addColumn('requested_columns', (table) => table.jsonb('requested_columns').notNullable().defaultTo('[]'));
  await addColumn('filters', (table) => table.jsonb('filters').notNullable().defaultTo('{}'));
  await addColumn('include_deleted', (table) => table.boolean('include_deleted').notNullable().defaultTo(false));
  await addColumn('storage_location', (table) => table.string('storage_location', 500).nullable());
  await addColumn('checksum', (table) => table.string('checksum', 128).nullable());
  await addColumn('mime_type', (table) => table.string('mime_type', 120).nullable());
  await addColumn('file_name', (table) => table.string('file_name', 255).nullable());
  await addColumn('retention_days', (table) => table.integer('retention_days').notNullable().defaultTo(7));
  await addColumn('artifact_expires_at', (table) => table.timestamp('artifact_expires_at').nullable());
  await addColumn('artifact_deleted_at', (table) => table.timestamp('artifact_deleted_at').nullable());
  await addColumn('fhir_resource_type', (table) => table.string('fhir_resource_type', 80).nullable());

  await knex.schema.alterTable('export_jobs', (table) => {
    table.index(['tenant_id', 'created_at'], 'export_jobs_tenant_created_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('export_jobs'))) return;

  await knex.schema.alterTable('export_jobs', (table) => {
    table.dropIndex(['tenant_id', 'created_at'], 'export_jobs_tenant_created_idx');
  });

  for (const column of [
    'requested_columns', 'filters', 'include_deleted', 'storage_location', 'checksum',
    'mime_type', 'file_name', 'retention_days', 'artifact_expires_at',
    'artifact_deleted_at', 'fhir_resource_type',
  ]) {
    if (await knex.schema.hasColumn('export_jobs', column)) {
      await knex.schema.alterTable('export_jobs', (table) => table.dropColumn(column));
    }
  }
}
