import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // national_id stores the AES-GCM encrypted value (base64, ~56 chars), not the
  // 14-digit plaintext. Widen from varchar(20) so encrypted values fit.
  await knex.schema.alterTable('patients', (table) => {
    table.string('national_id', 255).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('patients', (table) => {
    table.string('national_id', 20).alter();
  });
}
