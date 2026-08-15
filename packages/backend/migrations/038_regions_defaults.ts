import type { Knex } from 'knex';

/**
 * Seed the system `regions` catalog used by Settings > Regional Settings.
 * Idempotent: only inserts when the table is empty, so existing deployments
 * and fresh installs both end up with the same default region list.
 */
export async function up(knex: Knex): Promise<void> {
  const existing = await knex('regions').count('id as c').first();
  if (Number((existing as Record<string, unknown>)?.c || 0) > 0) return;

  const defaults = [
    { code: 'me-south-1', name: 'Middle East (Bahrain)', provider: 'aws', location: 'Bahrain', compliance_flags: JSON.stringify(['hipaa', 'gdpr']) },
    { code: 'eu-central-1', name: 'Europe (Frankfurt)', provider: 'aws', location: 'Germany', compliance_flags: JSON.stringify(['gdpr']) },
    { code: 'us-east-1', name: 'US East (N. Virginia)', provider: 'aws', location: 'United States', compliance_flags: JSON.stringify(['hipaa']) },
    { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', provider: 'aws', location: 'Singapore', compliance_flags: JSON.stringify(['gdpr']) },
    { code: 'local', name: 'Self-Hosted (On-Premise)', provider: 'self', location: 'Local', compliance_flags: JSON.stringify([]) },
  ];
  for (const r of defaults) {
    await knex('regions').insert({ ...r, is_active: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('regions').del();
}
