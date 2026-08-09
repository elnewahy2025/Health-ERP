import type { Knex } from 'knex';
import {
  SEED_ROLES,
  PERMISSION_CATALOG,
  expandRoleGrants,
  expandGrantKey,
  normalizeLegacyPermission,
} from '@healthcare/shared/authz';

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function seedTenantRoles(trx: Knex.Transaction, tenantId: string): Promise<Map<string, string>> {
  const roleIds = new Map<string, string>();
  for (const [slug, template] of Object.entries(SEED_ROLES)) {
    let role = await trx('roles').where({ tenant_id: tenantId, slug }).first();
    if (!role) {
      const [inserted] = await trx('roles')
        .insert({
          tenant_id: tenantId,
          name: slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          slug,
          description: template.description || null,
          permissions: '[]',
          is_system: true,
          level: template.level,
          scope_default: template.scopeDefault,
        })
        .returning('*');
      role = inserted;
    }
    roleIds.set(slug, String(role.id));

    const grants = expandRoleGrants(template);
    const existing = await trx('role_permissions').where({ role_id: role.id }).select('permission', 'scope');
    const existingKeys = new Set(existing.map((r: { permission: string; scope: string }) => `${r.permission}:${r.scope}`));
    for (const grant of grants) {
      const key = `${grant.permission}:${grant.scope}`;
      if (existingKeys.has(key)) continue;
      await trx('role_permissions').insert({
        role_id: role.id,
        tenant_id: tenantId,
        permission: grant.permission,
        scope: grant.scope,
      });
    }
  }
  return roleIds;
}

export async function up(knex: Knex): Promise<void> {
  // ── Departments (per-tenant dictionary) ──
  if (!(await knex.schema.hasTable('departments'))) {
    await knex.schema.createTable('departments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.string('code', 30).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'code']);
    });
  }

  // ── Normalized grants ──
  if (!(await knex.schema.hasTable('role_permissions'))) {
    await knex.schema.createTable('role_permissions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE');
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE').nullable();
      table.string('permission', 120).notNullable();
      table.string('scope', 30).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['role_id', 'permission', 'scope']);
    });
  }

  if (!(await knex.schema.hasTable('user_permissions'))) {
    await knex.schema.createTable('user_permissions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.string('permission', 120).notNullable();
      table.string('scope', 30).notNullable();
      table.uuid('assigned_by').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['user_id']);
      table.index(['tenant_id', 'permission']);
    });
  }

  // ── User role/branch assignments ──
  if (!(await knex.schema.hasTable('user_roles'))) {
    await knex.schema.createTable('user_roles', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE');
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('assigned_by').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'role_id']);
    });
  }

  if (!(await knex.schema.hasTable('user_branches'))) {
    await knex.schema.createTable('user_branches', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.uuid('branch_id').references('id').inTable('branches').onDelete('CASCADE');
      table.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
      table.boolean('is_primary').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'branch_id']);
    });
  }

  // ── Extend users ──
  const userCols = await knex.raw(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'",
  );
  const existingUserCols = userCols.rows.map((r: { column_name: string }) => r.column_name);
  await knex.schema.alterTable('users', (table) => {
    if (!existingUserCols.includes('employee_type')) {
      table.string('employee_type', 30).notNullable().defaultTo('staff');
    }
    if (!existingUserCols.includes('department_id')) {
      table.uuid('department_id').references('id').inTable('departments').nullable();
    }
    if (!existingUserCols.includes('position')) {
      table.string('position', 100).nullable();
    }
    if (!existingUserCols.includes('professional_info')) {
      table.jsonb('professional_info').defaultTo('{}');
    }
    if (!existingUserCols.includes('created_by')) {
      table.uuid('created_by').nullable();
    }
    if (!existingUserCols.includes('perm_version')) {
      table.integer('perm_version').notNullable().defaultTo(0);
    }
  });

  // ── Extend roles ──
  const roleCols = await knex.raw(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'roles'",
  );
  const existingRoleCols = roleCols.rows.map((r: { column_name: string }) => r.column_name);
  await knex.schema.alterTable('roles', (table) => {
    if (!existingRoleCols.includes('level')) {
      table.string('level', 20).notNullable().defaultTo('tenant');
    }
    if (!existingRoleCols.includes('scope_default')) {
      table.string('scope_default', 30).notNullable().defaultTo('tenant');
    }
  });

  // ── Extend audit_logs ──
  const auditCols = await knex.raw(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_logs'",
  );
  const existingAuditCols = auditCols.rows.map((r: { column_name: string }) => r.column_name);
  await knex.schema.alterTable('audit_logs', (table) => {
    if (!existingAuditCols.includes('branch_id')) {
      table.uuid('branch_id').nullable();
    }
    if (!existingAuditCols.includes('result')) {
      table.string('result', 20).nullable();
    }
    if (!existingAuditCols.includes('principal_kind')) {
      table.string('principal_kind', 20).notNullable().defaultTo('user');
    }
  });

  // ── Extend chat_participants (support patient principals) ──
  if (await knex.schema.hasTable('chat_participants')) {
    const participantCols = await knex.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'chat_participants'",
    );
    const existingParticipantCols = participantCols.rows.map((r: { column_name: string }) => r.column_name);
    await knex.schema.alterTable('chat_participants', (table) => {
      if (!existingParticipantCols.includes('principal_kind')) {
        table.string('principal_kind', 20).notNullable().defaultTo('user');
      }
      if (!existingParticipantCols.includes('patient_id')) {
        table.uuid('patient_id').references('id').inTable('patients').onDelete('CASCADE').nullable();
      }
    });
    if (existingParticipantCols.includes('user_id')) {
      await knex.raw('ALTER TABLE chat_participants ALTER COLUMN user_id DROP NOT NULL');
    }
  }

  // ── Backfill: seed roles + grants, user_roles, user_permissions, user_branches ──
  await knex.transaction(async (trx) => {
    const tenants = await trx('tenants').select('id');
    for (const tenant of tenants) {
      const tenantId = String(tenant.id);
      const roleIds = await seedTenantRoles(trx, tenantId);

      const users = await trx('users').where({ tenant_id: tenantId }).select('*');
      for (const user of users) {
        // user_roles from legacy roles jsonb
        for (const slug of parseJsonArray(user.roles)) {
          const roleId = roleIds.get(slug);
          if (!roleId) continue;
          const existing = await trx('user_roles')
            .where({ user_id: user.id, role_id: roleId })
            .first();
          if (!existing) {
            await trx('user_roles').insert({
              user_id: user.id,
              role_id: roleId,
              tenant_id: tenantId,
              assigned_by: user.id,
            });
          }
        }

        // user_permissions from legacy permissions jsonb (default scope: tenant)
        const directGrants = new Set<string>();
        for (const raw of parseJsonArray(user.permissions)) {
          const normalized = normalizeLegacyPermission(raw);
          const keys = normalized === '*' ? expandGrantKey('*') : expandGrantKey(normalized);
          for (const permission of keys) {
            if (!PERMISSION_CATALOG[permission.split('.')[0]] && normalized !== '*') continue;
            const grantKey = `${permission}:tenant`;
            if (directGrants.has(grantKey)) continue;
            directGrants.add(grantKey);
            await trx('user_permissions').insert({
              user_id: user.id,
              tenant_id: tenantId,
              permission,
              scope: 'tenant',
              assigned_by: user.id,
            });
          }
        }

        // user_branches from legacy single branch_id
        if (user.branch_id) {
          const existing = await trx('user_branches')
            .where({ user_id: user.id, branch_id: user.branch_id })
            .first();
          if (!existing) {
            await trx('user_branches').insert({
              user_id: user.id,
              branch_id: user.branch_id,
              tenant_id: tenantId,
              is_primary: true,
            });
          }
        }
      }
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_branches');
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('user_permissions');
  await knex.schema.dropTableIfExists('departments');

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('employee_type');
    table.dropColumn('department_id');
    table.dropColumn('position');
    table.dropColumn('professional_info');
    table.dropColumn('created_by');
    table.dropColumn('perm_version');
  });
  await knex.schema.alterTable('roles', (table) => {
    table.dropColumn('level');
    table.dropColumn('scope_default');
  });
  await knex.schema.alterTable('audit_logs', (table) => {
    table.dropColumn('branch_id');
    table.dropColumn('result');
    table.dropColumn('principal_kind');
  });
  if (await knex.schema.hasTable('chat_participants')) {
    await knex.schema.alterTable('chat_participants', (table) => {
      table.dropColumn('principal_kind');
      table.dropColumn('patient_id');
    });
  }
}
