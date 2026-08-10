import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 035 originally defined national_id as varchar(20) — too small for the
  // encrypted value. Widen to text (matches patients.national_id).
  await knex.raw('ALTER TABLE portal_enrollment_requests ALTER COLUMN national_id TYPE text');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE portal_enrollment_requests ALTER COLUMN national_id TYPE varchar(20)');
}
