import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const addColumn = async (tableName: string, columnName: string, callback: (table: Knex.AlterTableBuilder) => void) => {
    if (!(await knex.schema.hasColumn(tableName, columnName))) {
      await knex.schema.alterTable(tableName, callback);
    }
  };

  await addColumn('backup_executions', 'retention_days', (table) => table.integer('retention_days').defaultTo(30));
  await addColumn('backup_executions', 'storage_location', (table) => table.string('storage_location', 500).nullable());
  await addColumn('backup_executions', 'exclude_tables', (table) => table.jsonb('exclude_tables').defaultTo('[]'));
  await addColumn('backup_executions', 'row_count', (table) => table.integer('row_count').defaultTo(0));
  await addColumn('backup_executions', 'retention_expires_at', (table) => table.timestamp('retention_expires_at').nullable());
  await addColumn('backup_executions', 'artifact_deleted_at', (table) => table.timestamp('artifact_deleted_at').nullable());
  await addColumn('backup_executions', 'verified_at', (table) => table.timestamp('verified_at').nullable());
  await addColumn('backup_executions', 'verification_status', (table) => table.string('verification_status', 30).nullable());
  await addColumn('backup_executions', 'verification_error', (table) => table.text('verification_error').nullable());

  if (!(await knex.schema.hasTable('backup_restore_verifications'))) {
    await knex.schema.createTable('backup_restore_verifications', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE').notNullable();
      table.uuid('backup_execution_id').references('id').inTable('backup_executions').onDelete('CASCADE').notNullable();
      table.string('status', 30).notNullable().defaultTo('running'); // running, completed, failed
      table.string('target_reference', 500).nullable();
      table.integer('row_count').defaultTo(0);
      table.string('checksum', 128).nullable();
      table.text('error').nullable();
      table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['tenant_id', 'created_at']);
      table.index(['backup_execution_id', 'created_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('backup_restore_verifications');
  for (const column of [
    'retention_days',
    'storage_location',
    'exclude_tables',
    'row_count',
    'retention_expires_at',
    'artifact_deleted_at',
    'verified_at',
    'verification_status',
    'verification_error',
  ]) {
    if (await knex.schema.hasColumn('backup_executions', column)) {
      await knex.schema.alterTable('backup_executions', (table) => table.dropColumn(column));
    }
  }
}
