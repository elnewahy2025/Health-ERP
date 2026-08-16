import type { Knex } from 'knex';

/**
 * Aligns automation_rules with the automation module's data model.
 * The module stores rules with slug/category/trigger_type/trigger_config,
 * priority, max_executions, cooldown_minutes, created_by and last_triggered_at,
 * and stores actions in automation_rule_actions. This migration back-fills
 * the legacy table created in 010/011 so rule creation no longer fails.
 */
export async function up(knex: Knex): Promise<void> {
  const tableName = 'automation_rules';
  const has = async (column: string) => knex.schema.hasColumn(tableName, column);

  const columns: Array<[string, (t: Knex.AlterTableBuilder) => void]> = [
    ['slug', (t) => t.string('slug', 200).nullable()],
    ['category', (t) => t.string('category', 50).notNullable().defaultTo('general')],
    ['trigger_type', (t) => t.string('trigger_type', 50).notNullable().defaultTo('manual')],
    ['trigger_config', (t) => t.jsonb('trigger_config').defaultTo('{}')],
    ['description', (t) => t.text('description').nullable()],
    ['priority', (t) => t.integer('priority').notNullable().defaultTo(0)],
    ['max_executions', (t) => t.integer('max_executions').notNullable().defaultTo(0)],
    ['cooldown_minutes', (t) => t.integer('cooldown_minutes').notNullable().defaultTo(0)],
    ['created_by', (t) => t.uuid('created_by').nullable()],
    ['last_triggered_at', (t) => t.timestamp('last_triggered_at').nullable()],
  ];

  for (const [column, build] of columns) {
    if (!(await has(column))) {
      await knex.schema.alterTable(tableName, (t) => build(t));
    }
  }

  // Legacy columns were NOT NULL; new rules only set trigger_event when an
  // event-driven trigger is chosen and rely on automation_rule_actions.
  await knex.schema.alterTable(tableName, (t) => {
    t.dropNullable('trigger_event');
    t.dropNullable('action_type');
  });

  // Backfill slug for existing rows so listing/triggering stays consistent.
  await knex.raw(`
    UPDATE automation_rules
    SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9_]+', '_', 'g'))
    WHERE slug IS NULL OR slug = ''
  `);

  if (await knex.schema.hasTable('automation_execution_logs')) {
    if (!(await knex.schema.hasColumn('automation_execution_logs', 'created_by'))) {
      await knex.schema.alterTable('automation_execution_logs', (t) => {
        t.uuid('created_by').nullable();
      });
    }
  }

  // barcode_templates: the module stores created_by for audit; the column was
  // missing from the original table (011), causing POST /barcodes/templates to
  // fail with "column created_by does not exist".
  if (await knex.schema.hasTable('barcode_templates')) {
    if (!(await knex.schema.hasColumn('barcode_templates', 'created_by'))) {
      await knex.schema.alterTable('barcode_templates', (t) => {
        t.uuid('created_by').nullable();
      });
    }
  }

  // Same audit-column gap on workflow_instances, breach_log and branches:
  // modules insert created_by, so the write routes 500 without the column.
  const auditColumns: Array<[string, string]> = [
    ['workflow_instances', 'created_by'],
    ['breach_log', 'created_by'],
    ['branches', 'created_by'],
  ];
  for (const [table, column] of auditColumns) {
    if (await knex.schema.hasTable(table)) {
      if (!(await knex.schema.hasColumn(table, column))) {
        await knex.schema.alterTable(table, (t) => {
          t.uuid(column).nullable();
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Intentionally no-op: dropping columns would destroy data for running systems.
  void knex;
}
