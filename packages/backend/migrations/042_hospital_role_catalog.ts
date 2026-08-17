import type { Knex } from 'knex';
import { HOSPITAL_ROLE_CATALOG, hospitalRoleTemplate } from '@healthcare/shared/authz';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('role_template_catalog'))) {
    await knex.schema.createTable('role_template_catalog', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('slug', 80).notNullable().unique();
      table.string('name', 120).notNullable();
      table.text('description').nullable();
      table.string('default_scope', 30).notNullable();
      table.string('base_role_slug', 80).notNullable();
      table.boolean('is_system').notNullable().defaultTo(true);
      table.jsonb('grants').notNullable().defaultTo('[]');
      table.jsonb('denials').notNullable().defaultTo('[]');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  for (const [slug, name, _level, scopeDefault, baseRoleSlug] of HOSPITAL_ROLE_CATALOG) {
    const template = hospitalRoleTemplate(slug);
    if (!template) continue;
    const exists = await knex('role_template_catalog').where({ slug }).first();
    const payload = {
      slug,
      name,
      description: template.description || `${name} system role template`,
      default_scope: scopeDefault,
      base_role_slug: baseRoleSlug,
      is_system: true,
      grants: JSON.stringify(template.grants),
      denials: JSON.stringify([]),
      updated_at: knex.fn.now(),
    };
    if (exists) await knex('role_template_catalog').where({ slug }).update(payload);
    else await knex('role_template_catalog').insert(payload);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Catalog rows are configuration, but preserve them during ordinary rollback
  // to avoid removing role templates that may already be referenced by tenants.
  if (await knex.schema.hasTable('role_template_catalog')) {
    await knex('role_template_catalog').whereIn('slug', HOSPITAL_ROLE_CATALOG.map(([slug]) => slug)).update({ is_system: false });
  }
}
