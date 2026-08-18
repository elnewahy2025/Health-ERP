import type { Knex } from 'knex';
import { hospitalRoleTemplate } from '@healthcare/shared/authz';

/**
 * Keep the patient portal user strictly self-service. Staff portal enrollment
 * and OTP queues use patient_portal.manage and must never be exposed through
 * the self-scoped patient_portal_user template.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('role_template_catalog'))) return;
  const template = hospitalRoleTemplate('patient_portal_user');
  if (!template) return;

  await knex('role_template_catalog')
    .where({ slug: 'patient_portal_user', is_system: true })
    .update({
      grants: JSON.stringify(template.grants),
      denials: JSON.stringify([]),
      updated_at: knex.fn.now(),
    });
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-safe: the previous staff permission shape is intentionally not restored.
}
