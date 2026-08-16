import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Chat tables ──
  if (!(await knex.schema.hasTable('chat_conversations'))) {
    await knex.schema.createTable('chat_conversations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 200).nullable();
      table.uuid('created_by').references('id').inTable('users').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id']);
    });
  }

  if (!(await knex.schema.hasTable('chat_participants'))) {
    await knex.schema.createTable('chat_participants', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('conversation_id').references('id').inTable('chat_conversations').onDelete('CASCADE');
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.timestamp('joined_at').defaultTo(knex.fn.now());
      table.index(['conversation_id', 'user_id']);
    });
  }

  if (!(await knex.schema.hasTable('chat_messages'))) {
    await knex.schema.createTable('chat_messages', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('conversation_id').references('id').inTable('chat_conversations').onDelete('CASCADE');
      table.uuid('sender_id').references('id').inTable('users').nullable();
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.text('content').notNullable();
      table.timestamp('read_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['conversation_id', 'created_at']);
    });
  }

  // ── WhatsApp tables ──
  if (!(await knex.schema.hasTable('whatsapp_messages'))) {
    await knex.schema.createTable('whatsapp_messages', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('sender_id').references('id').inTable('users').nullable();
      table.uuid('patient_id').references('id').inTable('patients').nullable();
      table.string('to_number', 30).notNullable();
      table.text('message').notNullable();
      table.uuid('template_id').nullable();
      table.string('status', 20).defaultTo('sent');
      table.string('direction', 10).defaultTo('outbound');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'created_at']);
    });
  }

  if (!(await knex.schema.hasTable('whatsapp_templates'))) {
    await knex.schema.createTable('whatsapp_templates', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 200).notNullable();
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── Voice calls table ──
  if (!(await knex.schema.hasTable('voice_calls'))) {
    await knex.schema.createTable('voice_calls', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('sender_id').references('id').inTable('users').nullable();
      table.uuid('patient_id').references('id').inTable('patients').nullable();
      table.string('from_number', 30).nullable();
      table.string('to_number', 30).notNullable();
      table.string('status', 20).defaultTo('completed');
      table.string('direction', 10).defaultTo('outbound');
      table.integer('duration').defaultTo(0);
      table.timestamp('started_at').nullable();
      table.timestamp('ended_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'created_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('voice_calls');
  await knex.schema.dropTableIfExists('whatsapp_templates');
  await knex.schema.dropTableIfExists('whatsapp_messages');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_participants');
  await knex.schema.dropTableIfExists('chat_conversations');
}
