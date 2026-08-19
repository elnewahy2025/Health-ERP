import type { Knex } from 'knex';
import { hospitalRoleTemplate } from '@healthcare/shared/authz';

const ROLE_SLUGS = ['billing_manager', 'billing_officer', 'accountant'] as const;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('role_template_catalog'))) return;
  for (const slug of ROLE_SLUGS) {
    const template = hospitalRoleTemplate(slug);
    if (!template) continue;
    await knex('role_template_catalog')
      .where({ slug, is_system: true })
      .update({ grants: JSON.stringify(template.grants), denials: JSON.stringify([]), updated_at: knex.fn.now() });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: removing a grant from a deployed role can invalidate an audit-approved permission decision.
}
