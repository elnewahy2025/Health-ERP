import type { Knex } from 'knex';

/**
 * Break-glass emergency access (docs/engineering/AUTHORIZATION.md §8).
 * Controlled, time-limited, fully-audited access to a patient's restricted
 * data. Requires a reason; expires automatically; every activation/revocation
 * is written to audit_logs with the emergency flag.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('emergency_access'))) {
    await knex.schema.createTable('emergency_access', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE').notNullable();
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.uuid('patient_id').references('id').inTable('patients').onDelete('CASCADE').notNullable();
      table.text('reason').notNullable();
      table.string('status', 20).defaultTo('active'); // active | revoked | expired
      table.timestamp('expires_at').notNullable();
      table.uuid('revoked_by').references('id').inTable('users').nullable();
      table.timestamp('revoked_at').nullable();
      table.text('revoke_reason').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'user_id', 'status']);
      table.index(['tenant_id', 'patient_id', 'status']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('emergency_access');
}
