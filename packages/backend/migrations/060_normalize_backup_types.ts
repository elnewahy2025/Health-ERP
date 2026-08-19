import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('backup_configs')
    .whereNot('type', 'logical')
    .update({ type: 'logical', updated_at: knex.fn.now() });
}

export async function down(_knex: Knex): Promise<void> {
  // The previous values represented simulated modes and cannot be restored safely.
}
