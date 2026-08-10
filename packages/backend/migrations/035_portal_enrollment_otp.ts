import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Patient portal access requests (staff-verified enrollment) ──
  if (!(await knex.schema.hasTable('portal_enrollment_requests'))) {
    await knex.schema.createTable('portal_enrollment_requests', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE').notNullable();
      table.uuid('patient_id').references('id').inTable('patients').onDelete('SET NULL').nullable();
      table.string('first_name', 100).notNullable();
      table.string('last_name', 100).notNullable();
      table.string('country_code', 10).notNullable();
      table.string('phone', 30).notNullable();
      table.string('national_id', 20).notNullable();
      table.date('date_of_birth').notNullable();
      table.string('gender', 10).notNullable();
      table.string('email', 200).nullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.uuid('reviewed_by').nullable();
      table.timestamp('reviewed_at').nullable();
      table.text('notes').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'status']);
      table.index(['tenant_id', 'phone']);
    });
  }

  // ── portal_sessions: tenant scoping + encrypted OTP + delivery state ──
  if (await knex.schema.hasTable('portal_sessions')) {
    const cols = await knex.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'portal_sessions'",
    );
    const existing = new Set(cols.rows.map((r: { column_name: string }) => r.column_name));
    await knex.schema.alterTable('portal_sessions', (table) => {
      if (!existing.has('tenant_id')) {
        table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE').nullable();
      }
      if (!existing.has('otp_encrypted')) {
        table.text('otp_encrypted').nullable();
      }
      if (!existing.has('delivery_status')) {
        table.string('delivery_status', 20).notNullable().defaultTo('pending');
      }
      if (!existing.has('otp_requested_at')) {
        table.timestamp('otp_requested_at').nullable();
      }
      if (!existing.has('otp_sent_at')) {
        table.timestamp('otp_sent_at').nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('portal_enrollment_requests');
  if (await knex.schema.hasTable('portal_sessions')) {
    await knex.schema.alterTable('portal_sessions', (table) => {
      table.dropColumn('tenant_id');
      table.dropColumn('otp_encrypted');
      table.dropColumn('delivery_status');
      table.dropColumn('otp_requested_at');
      table.dropColumn('otp_sent_at');
    });
  }
}
