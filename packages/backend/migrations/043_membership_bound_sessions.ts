import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  for (const tableName of ['user_sessions', 'refresh_tokens']) {
    if (!(await knex.schema.hasTable(tableName))) continue;
    const cols = await knex.raw(
      'SELECT column_name FROM information_schema.columns WHERE table_name = ?',
      [tableName],
    );
    const names = new Set(cols.rows.map((row: { column_name: string }) => row.column_name));
    if (!names.has('membership_id')) {
      await knex.schema.alterTable(tableName, (table) => {
        table.uuid('membership_id').nullable().references('id').inTable('memberships').onDelete('SET NULL');
      });
    }
    await knex.raw(`CREATE INDEX IF NOT EXISTS ${tableName}_membership_idx ON ${tableName} (membership_id)`);
  }

  if (await knex.schema.hasTable('memberships')) {
    await knex.transaction(async (trx) => {
      await trx('refresh_tokens')
        .whereNull('membership_id')
        .where('is_revoked', false)
        .update({
          membership_id: trx('memberships')
            .select('id')
            .whereRaw('memberships.user_id = refresh_tokens.user_id')
            .whereRaw('memberships.tenant_id = refresh_tokens.tenant_id')
            .where('memberships.status', 'ACTIVE')
            .orderBy('memberships.is_default', 'desc')
            .orderBy('memberships.created_at', 'asc')
            .limit(1),
        });
      await trx('user_sessions')
        .whereNull('membership_id')
        .where('is_active', true)
        .update({
          membership_id: trx('memberships')
            .select('id')
            .whereRaw('memberships.user_id = user_sessions.user_id')
            .whereRaw('memberships.tenant_id = user_sessions.tenant_id')
            .where('memberships.status', 'ACTIVE')
            .orderBy('memberships.is_default', 'desc')
            .orderBy('memberships.created_at', 'asc')
            .limit(1),
        });
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of ['user_sessions', 'refresh_tokens']) {
    if (await knex.schema.hasTable(tableName)) {
      await knex.schema.alterTable(tableName, (table) => table.dropColumn('membership_id'));
    }
  }
}
