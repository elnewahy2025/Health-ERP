import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasFavorites = await knex.schema.hasTable('user_favorites');
  if (!hasFavorites) {
    await knex.schema.createTable('user_favorites', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('path', 255).notNullable();
      table.string('label', 255).notNullable();
      table.integer('position').notNullable().defaultTo(0);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'path']);
      table.index(['tenant_id', 'user_id']);
    });
  }

  const hasRecentPages = await knex.schema.hasTable('user_recent_pages');
  if (!hasRecentPages) {
    await knex.schema.createTable('user_recent_pages', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('path', 255).notNullable();
      table.string('label', 255).notNullable();
      table.timestamp('visited_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'path']);
      table.index(['tenant_id', 'user_id', 'visited_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_recent_pages');
  await knex.schema.dropTableIfExists('user_favorites');
}
