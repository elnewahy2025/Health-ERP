import type { Knex } from 'knex';
import { hospitalRoleTemplate } from '@healthcare/shared/authz';

/**
 * Existing system templates must carry the concrete department mutation grants
 * used by the departments module. Tenant custom roles remain untouched.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('role_template_catalog'))) return;

  for (const slug of ['laboratory_manager', 'radiology_manager']) {
    const template = hospitalRoleTemplate(slug);
    if (!template) continue;
    await knex('role_template_catalog')
      .where({ slug, is_system: true })
      .update({
        grants: JSON.stringify(template.grants),
        denials: JSON.stringify([]),
        updated_at: knex.fn.now(),
      });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: do not restore incomplete department permissions.
}
