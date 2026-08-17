import type { Knex } from 'knex';
import { HOSPITAL_ROLE_CATALOG, hospitalRoleTemplate } from '@healthcare/shared/authz';

/**
 * Replace the original shared-base role-template payloads with the explicit
 * job-function grant maps introduced in the shared authorization catalog.
 * Existing tenant roles are intentionally untouched; only system templates are
 * updated and future clones consume these explicit rows.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('role_template_catalog'))) return;

  if (!(await knex.schema.hasColumn('role_template_catalog', 'level'))) {
    await knex.schema.alterTable('role_template_catalog', (table) => {
      table.string('level', 20).notNullable().defaultTo('tenant');
    });
  }

  for (const [slug, name, level, scopeDefault, baseRoleSlug] of HOSPITAL_ROLE_CATALOG) {
    const template = hospitalRoleTemplate(slug);
    if (!template) continue;
    await knex('role_template_catalog')
      .where({ slug })
      .update({
        name,
        level,
        default_scope: scopeDefault,
        base_role_slug: baseRoleSlug,
        is_system: true,
        grants: JSON.stringify(template.grants),
        denials: JSON.stringify([]),
        updated_at: knex.fn.now(),
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('role_template_catalog', 'level')) {
    await knex.schema.alterTable('role_template_catalog', (table) => table.dropColumn('level'));
  }
}
