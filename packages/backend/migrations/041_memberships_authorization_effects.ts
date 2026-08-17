import type { Knex } from 'knex';

/**
 * Additive authorization foundation. Existing tenant_id, role, permission, and
 * branch columns remain in place for the compatibility window; new code may
 * resolve through memberships while legacy callers continue to function.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('memberships'))) {
    await knex.schema.createTable('memberships', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
      table.string('status', 20).notNullable().defaultTo('ACTIVE');
      table.boolean('is_default').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('suspended_at').nullable();
      table.uuid('created_by').nullable();
      table.unique(['user_id', 'tenant_id', 'branch_id', 'department_id']);
      table.index(['user_id', 'status']);
      table.index(['tenant_id', 'status']);
      table.index(['branch_id', 'status']);
      table.index(['department_id', 'status']);
    });
  }

  const membershipCols = await knex.raw(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'memberships'",
  );
  const membershipColumnNames = new Set(
    membershipCols.rows.map((row: { column_name: string }) => row.column_name),
  );
  if (!membershipColumnNames.has('is_default')) {
    await knex.schema.alterTable('memberships', (table) => table.boolean('is_default').notNullable().defaultTo(false));
  }

  for (const tableName of ['role_permissions', 'user_permissions']) {
    const cols = await knex.raw(
      'SELECT column_name FROM information_schema.columns WHERE table_name = ?',
      [tableName],
    );
    const names = new Set(cols.rows.map((row: { column_name: string }) => row.column_name));
    await knex.schema.alterTable(tableName, (table) => {
      if (!names.has('effect')) table.string('effect', 10).notNullable().defaultTo('ALLOW');
      if (!names.has('membership_id')) table.uuid('membership_id').nullable().references('id').inTable('memberships').onDelete('CASCADE');
    });
    if (!names.has('effect')) await knex.raw(`UPDATE ${tableName} SET effect = 'ALLOW' WHERE effect IS NULL`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS ${tableName}_membership_effect_idx ON ${tableName} (membership_id, effect)`);
  }

  for (const tableName of ['user_roles', 'user_branches']) {
    const cols = await knex.raw(
      'SELECT column_name FROM information_schema.columns WHERE table_name = ?',
      [tableName],
    );
    const names = new Set(cols.rows.map((row: { column_name: string }) => row.column_name));
    if (!names.has('membership_id')) {
      await knex.schema.alterTable(tableName, (table) => {
        table.uuid('membership_id').nullable().references('id').inTable('memberships').onDelete('CASCADE');
      });
    }
    await knex.raw(`CREATE INDEX IF NOT EXISTS ${tableName}_membership_idx ON ${tableName} (membership_id)`);
  }

  // Backfill one membership per existing user/tenant/branch context. The
  // unique key makes this safe to rerun and preserves the legacy context.
  await knex.transaction(async (trx) => {
    const users = await trx('users').select('id', 'tenant_id', 'branch_id', 'department_id', 'status');
    for (const user of users) {
      const branchRows = await trx('user_branches')
        .where({ user_id: user.id, tenant_id: user.tenant_id })
        .select('branch_id');
      const branchIds = Array.from(new Set([
        ...(user.branch_id ? [String(user.branch_id)] : []),
        ...branchRows.map((row: { branch_id: string }) => String(row.branch_id)),
      ]));
      const contexts = branchIds.length > 0 ? branchIds : [null];

      for (let index = 0; index < contexts.length; index += 1) {
        const branchId = contexts[index];
        let membership = await trx('memberships')
          .where({ user_id: user.id, tenant_id: user.tenant_id })
          .modify((query) => {
            if (branchId) query.andWhere('branch_id', branchId);
            else query.whereNull('branch_id');
          })
          .where((query) => {
            if (user.department_id) query.andWhere('department_id', user.department_id);
            else query.whereNull('department_id');
          })
          .first();

        if (!membership) {
          const [created] = await trx('memberships').insert({
            user_id: user.id,
            tenant_id: user.tenant_id,
            branch_id: branchId,
            department_id: user.department_id || null,
            status: String(user.status || 'active').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
            is_default: index === 0,
          }).returning('*');
          membership = created;
        }

        await trx('user_roles')
          .where({ user_id: user.id, tenant_id: user.tenant_id })
          .whereNull('membership_id')
          .update({ membership_id: membership.id });
        await trx('user_permissions')
          .where({ user_id: user.id, tenant_id: user.tenant_id })
          .whereNull('membership_id')
          .update({ membership_id: membership.id });
        await trx('user_branches')
          .where({ user_id: user.id, tenant_id: user.tenant_id, branch_id: branchId })
          .whereNull('membership_id')
          .update({ membership_id: membership.id });
      }
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  // The migration is intentionally non-destructive in production. Remove only
  // metadata columns and the empty membership table during an explicit rollback.
  if (await knex.schema.hasTable('user_branches')) {
    await knex.schema.alterTable('user_branches', (table) => table.dropColumn('membership_id'));
  }
  if (await knex.schema.hasTable('user_roles')) {
    await knex.schema.alterTable('user_roles', (table) => table.dropColumn('membership_id'));
  }
  for (const tableName of ['role_permissions', 'user_permissions']) {
    if (await knex.schema.hasTable(tableName)) {
      await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('membership_id');
        table.dropColumn('effect');
      });
    }
  }
  // Membership records are retained unless the operator has explicitly emptied
  // the table; this prevents accidental production data loss during rollback.
}
