import type { Knex } from 'knex';

async function addColumn(knex: Knex, tableName: string, column: string, definition: (table: Knex.CreateTableBuilder) => void): Promise<void> {
  if (await knex.schema.hasTable(tableName) && !(await knex.schema.hasColumn(tableName, column))) {
    await knex.schema.alterTable(tableName, definition);
  }
}

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('eta_invoices')) {
    await addColumn(knex, 'eta_invoices', 'request_hash', (table) => table.string('request_hash', 128).nullable());
    await addColumn(knex, 'eta_invoices', 'document_hash', (table) => table.string('document_hash', 128).nullable());
    await addColumn(knex, 'eta_invoices', 'document_type_version', (table) => table.string('document_type_version', 30).nullable());
    await addColumn(knex, 'eta_invoices', 'internal_id', (table) => table.string('internal_id', 160).nullable());
    await addColumn(knex, 'eta_invoices', 'submission_uuid', (table) => table.string('submission_uuid', 120).nullable());
    await addColumn(knex, 'eta_invoices', 'long_id', (table) => table.string('long_id', 500).nullable());
    await addColumn(knex, 'eta_invoices', 'status_payload', (table) => table.jsonb('status_payload').nullable());
    await addColumn(knex, 'eta_invoices', 'submission_attempts', (table) => table.integer('submission_attempts').notNullable().defaultTo(0));
    await addColumn(knex, 'eta_invoices', 'next_retry_at', (table) => table.timestamp('next_retry_at').nullable());
    await addColumn(knex, 'eta_invoices', 'last_status_check_at', (table) => table.timestamp('last_status_check_at').nullable());
    await addColumn(knex, 'eta_invoices', 'last_http_status', (table) => table.integer('last_http_status').nullable());
    await addColumn(knex, 'eta_invoices', 'last_error_code', (table) => table.string('last_error_code', 100).nullable());
    await addColumn(knex, 'eta_invoices', 'provider_environment', (table) => table.string('provider_environment', 30).nullable());
    await addColumn(knex, 'eta_invoices', 'updated_at', (table) => table.timestamp('updated_at').defaultTo(knex.fn.now()));
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_eta_invoices_submission_status ON eta_invoices (tenant_id, status, next_retry_at)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_eta_invoices_request_hash ON eta_invoices (tenant_id, request_hash)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_eta_invoices_submission_uuid ON eta_invoices (tenant_id, submission_uuid)');
  }

  if (!(await knex.schema.hasTable('eta_notification_deliveries'))) {
    await knex.schema.createTable('eta_notification_deliveries', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE').notNullable();
      table.string('delivery_id', 200).notNullable();
      table.string('notification_type', 80).nullable();
      table.jsonb('payload').notNullable();
      table.timestamp('processed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'delivery_id']);
      table.index(['tenant_id', 'created_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_eta_invoices_submission_status');
  await knex.raw('DROP INDEX IF EXISTS idx_eta_invoices_request_hash');
  await knex.raw('DROP INDEX IF EXISTS idx_eta_invoices_submission_uuid');
  await knex.schema.dropTableIfExists('eta_notification_deliveries');
  if (await knex.schema.hasTable('eta_invoices')) {
    const columns = ['request_hash', 'document_hash', 'document_type_version', 'internal_id', 'submission_uuid', 'long_id', 'status_payload', 'submission_attempts', 'next_retry_at', 'last_status_check_at', 'last_http_status', 'last_error_code', 'provider_environment', 'updated_at'];
    const existing = (await Promise.all(columns.map(async (column) => [column, await knex.schema.hasColumn('eta_invoices', column)] as const))).filter(([, has]) => has).map(([column]) => column);
    if (existing.length > 0) await knex.schema.alterTable('eta_invoices', (table) => existing.forEach((column) => table.dropColumn(column)));
  }
}
