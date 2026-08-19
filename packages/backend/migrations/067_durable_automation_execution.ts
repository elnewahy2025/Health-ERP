import type { Knex } from 'knex';

const EMPTY_JSON = (knex: Knex) => knex.raw("'{}'::jsonb");

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('automation_rules')) {
    if (await knex.schema.hasColumn('automation_rules', 'trigger_event')) {
      await knex.raw('ALTER TABLE automation_rules ALTER COLUMN trigger_event DROP NOT NULL');
    }
    if (await knex.schema.hasColumn('automation_rules', 'action_type')) {
      await knex.raw('ALTER TABLE automation_rules ALTER COLUMN action_type DROP NOT NULL');
    }
    const ruleColumns: Array<[string, (table: Knex.AlterTableBuilder) => void]> = [
      ['next_run_at', (table) => table.timestamp('next_run_at').nullable()],
      ['last_scheduled_at', (table) => table.timestamp('last_scheduled_at').nullable()],
    ];
    for (const [column, add] of ruleColumns) {
      if (!(await knex.schema.hasColumn('automation_rules', column))) {
        await knex.schema.alterTable('automation_rules', add);
      }
    }
    await knex.schema.alterTable('automation_rules', (table) => {
      table.index(['tenant_id', 'trigger_type', 'is_active', 'next_run_at'], 'automation_rules_schedule_due_idx');
    }).catch(() => {});
  }

  if (await knex.schema.hasTable('notification_logs')) {
    if (!(await knex.schema.hasColumn('notification_logs', 'idempotency_key'))) {
      await knex.schema.alterTable('notification_logs', (table) => table.string('idempotency_key', 255).nullable());
    }
    await knex.schema.alterTable('notification_logs', (table) => {
      table.unique(['tenant_id', 'idempotency_key'], { indexName: 'notification_logs_tenant_key_unique' });
    }).catch(() => {});
  }

  if (!(await knex.schema.hasTable('automation_events'))) {
    await knex.schema.createTable('automation_events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('event_key', 255).notNullable();
      table.string('event_type', 120).notNullable();
      table.string('reference_type', 100).nullable();
      table.string('reference_id', 255).nullable();
      table.jsonb('payload').notNullable().defaultTo(EMPTY_JSON(knex));
      table.string('status', 30).notNullable().defaultTo('pending');
      table.integer('attempt_count').notNullable().defaultTo(0);
      table.integer('max_attempts').notNullable().defaultTo(3);
      table.timestamp('available_at').notNullable().defaultTo(knex.fn.now());
      table.string('locked_by', 120).nullable();
      table.timestamp('locked_until').nullable();
      table.timestamp('processed_at').nullable();
      table.text('last_error').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'event_key'], { indexName: 'automation_events_tenant_key_unique' });
      table.index(['status', 'available_at'], 'automation_events_claim_idx');
      table.index(['tenant_id', 'event_type', 'created_at'], 'automation_events_tenant_type_idx');
    });
  }

  if (await knex.schema.hasTable('automation_execution_logs')) {
    const executionColumns: Array<[string, (table: Knex.AlterTableBuilder) => void]> = [
      ['event_id', (table) => table.uuid('event_id').nullable().references('id').inTable('automation_events').onDelete('SET NULL')],
      ['idempotency_key', (table) => table.string('idempotency_key', 255).nullable()],
      ['attempt_count', (table) => table.integer('attempt_count').notNullable().defaultTo(0)],
      ['max_attempts', (table) => table.integer('max_attempts').notNullable().defaultTo(3)],
      ['next_attempt_at', (table) => table.timestamp('next_attempt_at').nullable()],
      ['lease_owner', (table) => table.string('lease_owner', 120).nullable()],
      ['lease_expires_at', (table) => table.timestamp('lease_expires_at').nullable()],
      ['queued_at', (table) => table.timestamp('queued_at').notNullable().defaultTo(knex.fn.now())],
      ['updated_at', (table) => table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())],
    ];
    for (const [column, add] of executionColumns) {
      if (!(await knex.schema.hasColumn('automation_execution_logs', column))) {
        await knex.schema.alterTable('automation_execution_logs', add);
      }
    }
    await knex.schema.alterTable('automation_execution_logs', (table) => {
      table.unique(['tenant_id', 'idempotency_key'], { indexName: 'automation_execution_tenant_key_unique' });
      table.index(['status', 'next_attempt_at', 'lease_expires_at'], 'automation_execution_claim_idx');
      table.index(['tenant_id', 'event_id'], 'automation_execution_event_idx');
    }).catch(() => {});
  }

  if (!(await knex.schema.hasTable('automation_execution_steps'))) {
    await knex.schema.createTable('automation_execution_steps', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('execution_id').notNullable().references('id').inTable('automation_execution_logs').onDelete('CASCADE');
      table.integer('step_order').notNullable();
      table.string('action_type', 100).notNullable();
      table.string('action_name', 200).nullable();
      table.jsonb('action_config').notNullable().defaultTo(EMPTY_JSON(knex));
      table.jsonb('condition_override').notNullable().defaultTo(EMPTY_JSON(knex));
      table.string('idempotency_key', 255).notNullable();
      table.string('status', 30).notNullable().defaultTo('pending');
      table.integer('attempt_count').notNullable().defaultTo(0);
      table.integer('max_attempts').notNullable().defaultTo(1);
      table.timestamp('available_at').notNullable().defaultTo(knex.fn.now());
      table.string('locked_by', 120).nullable();
      table.timestamp('locked_until').nullable();
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.jsonb('output_data').nullable();
      table.string('error_code', 120).nullable();
      table.text('error_message').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['execution_id', 'step_order'], { indexName: 'automation_steps_execution_order_unique' });
      table.unique(['tenant_id', 'idempotency_key'], { indexName: 'automation_steps_tenant_key_unique' });
      table.index(['status', 'available_at', 'locked_until'], 'automation_steps_claim_idx');
      table.index(['tenant_id', 'execution_id'], 'automation_steps_tenant_execution_idx');
    });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: automation events, execution evidence, and idempotency history are never deleted by rollback.
}
