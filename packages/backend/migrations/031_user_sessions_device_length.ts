import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_sessions', (table) => {
    table.string('device', 255).alter();
    table.string('user_agent', 1000).alter();
  });
  await knex.schema.alterTable('refresh_tokens', (table) => {
    table.string('user_agent', 1000).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_sessions', (table) => {
    table.string('device', 100).alter();
    table.string('user_agent', 500).alter();
  });
  await knex.schema.alterTable('refresh_tokens', (table) => {
    table.string('user_agent').alter();
  });
}
