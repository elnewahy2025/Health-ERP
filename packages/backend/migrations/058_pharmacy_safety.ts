import type { Knex } from 'knex';
import { hospitalRoleTemplate } from '@healthcare/shared/authz';

/**
 * Additive pharmacy safety state. Existing prescriptions and inventory remain
 * valid; the new request/record tables make safe dispensing auditable and
 * retry-safe without deleting historical data on rollback.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('pharmacy_prescriptions') && !(await knex.schema.hasColumn('pharmacy_prescriptions', 'clinical_override_reason'))) {
    await knex.schema.alterTable('pharmacy_prescriptions', (table) => {
      table.text('clinical_override_reason').nullable();
    });
  }

  if (await knex.schema.hasTable('pharmacy_prescriptions') && !(await knex.schema.hasTable('pharmacy_dispense_requests'))) {
    await knex.schema.createTable('pharmacy_dispense_requests', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('prescription_id').notNullable().references('id').inTable('pharmacy_prescriptions').onDelete('CASCADE');
      table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('CASCADE');
      table.string('idempotency_key', 160).notNullable();
      table.string('status', 30).notNullable().defaultTo('completed');
      table.text('override_reason').nullable();
      table.uuid('dispensed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('error_message').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'idempotency_key'], 'pharmacy_dispense_requests_tenant_key_uq');
      table.index(['tenant_id', 'prescription_id']);
    });
  }

  if (await knex.schema.hasTable('pharmacy_dispense_requests') && !(await knex.schema.hasTable('pharmacy_dispense_records'))) {
    await knex.schema.createTable('pharmacy_dispense_records', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('request_id').notNullable().references('id').inTable('pharmacy_dispense_requests').onDelete('CASCADE');
      table.uuid('prescription_id').notNullable().references('id').inTable('pharmacy_prescriptions').onDelete('CASCADE');
      table.uuid('prescription_item_id').notNullable().references('id').inTable('pharmacy_prescription_items').onDelete('CASCADE');
      table.uuid('inventory_id').notNullable().references('id').inTable('pharmacy_inventory').onDelete('RESTRICT');
      table.integer('quantity').notNullable();
      table.string('batch_number', 100).nullable();
      table.date('expiry_date').nullable();
      table.decimal('unit_price', 12, 2).notNullable().defaultTo(0);
      table.uuid('dispensed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'prescription_id']);
      table.index(['tenant_id', 'inventory_id']);
      table.index(['request_id', 'prescription_item_id']);
    });
  }

  if (await knex.schema.hasTable('role_template_catalog')) {
    for (const slug of ['physician', 'consultant_physician', 'resident_physician', 'pharmacist', 'pharmacy_technician']) {
      const template = hospitalRoleTemplate(slug);
      if (!template) continue;
      await knex('role_template_catalog')
        .where({ slug, is_system: true })
        .update({ grants: JSON.stringify(template.grants), denials: JSON.stringify([]), updated_at: knex.fn.now() });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Preserve dispense history and system role-template state on rollback.
  void knex;
}
