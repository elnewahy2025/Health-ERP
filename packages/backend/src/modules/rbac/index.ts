import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PERMISSION_CATALOG,
  SEED_ROLES,
  HOSPITAL_ROLE_CATALOG,
  hospitalRoleTemplate,
  expandRoleGrants,
  expandGrantKey,
  allPermissionKeys,
  type PermissionScope,
} from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { invalidateAuthorizationCache, loadUserPrincipal, uniquePermissionKeys, hasPermission } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { revokeAllUserTokens } from '../../services/refresh-token.js';

function expandPermissionInputs(
  inputs: string[],
  scope: PermissionScope,
  effect: 'ALLOW' | 'DENY',
): Array<{ permission: string; scope: PermissionScope; effect: 'ALLOW' | 'DENY' }> {
  const rows: Array<{ permission: string; scope: PermissionScope; effect: 'ALLOW' | 'DENY' }> = [];
  const seen = new Set<string>();
  for (const raw of inputs) {
    const keys = raw === '*' ? allPermissionKeys() : expandGrantKey(raw);
    for (const permission of keys) {
      const key = `${permission}:${scope}:${effect}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ permission, scope, effect });
    }
  }
  return rows;
}

async function resolveTargetMembership(userId: string, tenantId: string, membershipId?: string) {
  const query = db('memberships').where({ user_id: userId, tenant_id: tenantId, status: 'ACTIVE' });
  if (membershipId) query.andWhere('id', membershipId);
  return query.orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'asc' }]).first();
}

export async function registerRbacModule(app: FastifyInstance) {

  // Get all available permissions
  app.get('/api/v1/rbac/permissions', { preHandler: [authenticate, authorize('roles.view')] }, async (request, reply) => {
    const permissions: unknown[] = [];
    for (const [module, actions] of Object.entries(PERMISSION_CATALOG)) {
      for (const action of actions) permissions.push({ module, action, key: `${module}.${action}` });
    }
    return sendSuccess(reply, {
      permissions,
      modules: Object.keys(PERMISSION_CATALOG),
      actions: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'print', 'download', 'manage', 'assign', 'cancel'],
    });
  });

  // Get the 39 system templates plus tenant custom roles. The catalog table
  // is populated by migration 042; the fallback preserves pre-migration reads.
  app.get('/api/v1/rbac/roles', { preHandler: [authenticate, authorize({ permission: 'roles.view', scope: 'auto' })] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const catalogRows = await db.schema.hasTable('role_template_catalog')
      ? await db('role_template_catalog').where({ is_system: true }).orderBy('name', 'asc')
      : [];
    const templates = catalogRows.length > 0
      ? catalogRows.map((row: Record<string, unknown>) => ({
        id: null,
        slug: String(row.slug),
        name: String(row.name),
        level: String(row.level || (String(row.slug) === 'super_administrator' ? 'system' : 'tenant')),
        scopeDefault: String(row.default_scope),
        description: row.description || null,
        isSystem: true,
        grants: typeof row.grants === 'string' ? JSON.parse(row.grants) : (row.grants || {}),
        denials: typeof row.denials === 'string' ? JSON.parse(row.denials) : (row.denials || []),
      }))
      : [
        ...Object.entries(SEED_ROLES).map(([slug, template]) => ({
          id: null,
          slug,
          name: slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          level: template.level,
          scopeDefault: template.scopeDefault,
          description: template.description || null,
          isSystem: true,
          grants: expandRoleGrants(template),
          denials: [],
        })),
        ...HOSPITAL_ROLE_CATALOG.map(([slug, name]) => {
          const template = hospitalRoleTemplate(slug);
          return {
            id: null,
            slug,
            name,
            level: template?.level || 'tenant',
            scopeDefault: template?.scopeDefault || 'tenant',
            description: template?.description || null,
            isSystem: true,
            grants: template ? Object.entries(template.grants).flatMap(([permission, scopes]) => scopes.map((scope) => ({ permission, scope }))) : [],
            denials: [],
          };
        }),
      ];

    const dbRoles = await db('roles').where({ tenant_id: tenantId }).select('*');
    const merged: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const t of templates) {
      seen.add(String(t.slug));
      merged.push(t);
    }
    for (const role of dbRoles) {
      if (seen.has(String(role.slug))) continue;
      const grants = await db('role_permissions').where({ role_id: role.id }).select('permission', 'scope', 'effect');
      merged.push({
        id: role.id,
        slug: role.slug,
        name: role.name,
        level: role.level || 'custom',
        scopeDefault: role.scope_default || 'tenant',
        description: role.description || null,
        isSystem: Boolean(role.is_system),
        grants: grants.filter((g) => String(g.effect || 'ALLOW').toUpperCase() !== 'DENY').map((g) => ({ permission: String(g.permission), scope: String(g.scope) })),
        denials: grants.filter((g) => String(g.effect || 'ALLOW').toUpperCase() === 'DENY').map((g) => ({ permission: String(g.permission), scope: String(g.scope) })),
      });
    }
    return sendSuccess(reply, merged);
  });

  // Clone a system template into the active tenant. Templates remain immutable.
  app.post('/api/v1/rbac/roles/clone', { preHandler: [authenticate, authorize({ permission: 'roles.create', scope: 'auto' })] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const body = z.object({
      templateSlug: z.string().min(1),
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
    }).parse(request.body);
    const existing = await db('roles').where({ tenant_id: tenantId, slug: body.slug }).first();
    if (existing) throw new ForbiddenError(`Role '${body.slug}' already exists in this organization`);

    const catalogRow = await db.schema.hasTable('role_template_catalog')
      ? await db('role_template_catalog').where({ slug: body.templateSlug, is_system: true }).first()
      : null;
    const fallback = SEED_ROLES[body.templateSlug];
    const catalogFallback = hospitalRoleTemplate(body.templateSlug);
    const fallbackTemplate = catalogFallback || fallback;
    if (!catalogRow && !fallbackTemplate) return sendError(reply, 'System role template not found', 404);

    const grantRows: Array<{ permission: string; scope: PermissionScope; effect: 'ALLOW' | 'DENY' }> = [];
    if (catalogRow) {
      const grants = typeof catalogRow.grants === 'string' ? JSON.parse(catalogRow.grants) : (catalogRow.grants || {});
      const denials = typeof catalogRow.denials === 'string' ? JSON.parse(catalogRow.denials) : (catalogRow.denials || []);
      for (const [permission, scopes] of Object.entries(grants as Record<string, string[]>)) {
        for (const scope of scopes) grantRows.push(...expandPermissionInputs([permission], scope as PermissionScope, 'ALLOW'));
      }
      for (const denial of denials as Array<{ permission: string; scope: PermissionScope }>) {
        grantRows.push(...expandPermissionInputs([denial.permission], denial.scope, 'DENY'));
      }
    } else {
      grantRows.push(...Object.entries(fallbackTemplate!.grants).flatMap(([permission, scopes]) => scopes.flatMap((scope) => expandPermissionInputs([permission], scope, 'ALLOW'))));
    }
    const isSuper = hasPermission(principal, '*');
    if (!isSuper) {
      for (const grant of grantRows) {
        if (!hasPermission(principal, grant.permission, grant.scope)) {
          throw new ForbiddenError(`Cannot clone template '${body.templateSlug}': exceeds your permissions`);
        }
      }
    }

    const role = await db.transaction(async (trx) => {
      const [created] = await trx('roles').insert({
        tenant_id: tenantId,
        name: body.name,
        slug: body.slug,
        description: catalogRow?.description || fallbackTemplate?.description || null,
        permissions: '[]',
        is_system: false,
        level: 'custom',
        scope_default: catalogRow?.default_scope || fallbackTemplate?.scopeDefault || 'tenant',
      }).returning('*');
      for (const grant of grantRows) {
        await trx('role_permissions').insert({ role_id: created.id, tenant_id: tenantId, permission: grant.permission, scope: grant.scope, effect: grant.effect });
      }
      return created;
    });
    await logAudit({ tenantId, userId: actorId, action: 'role.cloned', entityType: 'role', entityId: role.id, metadata: { templateSlug: body.templateSlug } });
    return sendSuccess(reply, { id: role.id, name: role.name, slug: role.slug, templateSlug: body.templateSlug }, 'Role cloned', 201);
  });

  // Get user permissions
  app.get('/api/v1/rbac/users/:userId/permissions', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep), authorize('users.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);

    const principal = await loadUserPrincipal(userId, tenantId);
    if (!principal) return sendError(reply, 'User not found', 404);

    return sendSuccess(reply, {
      userId,
      roles: principal.roles,
      permissions: uniquePermissionKeys(principal.grants),
      denials: principal.denials || [],
      isSuperAdmin: principal.roles.includes('super_admin'),
    });
  });

  // Update user roles/permissions with privilege-escalation protection
  app.put('/api/v1/rbac/users/:userId/permissions', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep), authorize('users.assign')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      membershipId: z.string().uuid().optional(),
      roles: z.array(z.string()).optional(),
      permissions: z.array(z.string()).optional(),
      denials: z.array(z.string()).optional(),
    }).parse(request.body);

    const target = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!target) return sendError(reply, 'User not found', 404);
    const targetMembership = await resolveTargetMembership(userId, tenantId, body.membershipId);
    if (!targetMembership) return sendError(reply, 'Active target membership not found', 404);

    // Escalation cap: an actor can only assign grants they themselves hold.
    const isSuper = hasPermission(principal, '*');
    if (body.roles) {
      const roles = await db('roles').where({ tenant_id: tenantId }).whereIn('slug', body.roles).select('*');
      for (const role of roles) {
        const roleGrants = await db('role_permissions').where({ role_id: role.id }).select('permission', 'scope');
        for (const grant of roleGrants) {
          if (!isSuper && !hasPermission(principal, String(grant.permission), grant.scope as PermissionScope)) {
            throw new ForbiddenError(`Cannot assign role '${role.slug}': exceeds your permissions`);
          }
        }
      }
    }
    for (const raw of [...(body.permissions || []), ...(body.denials || [])]) {
      const keys = raw === '*' ? allPermissionKeys() : expandGrantKey(raw);
      for (const permission of keys) {
        if (!isSuper && !hasPermission(principal, permission)) {
          throw new ForbiddenError(`Cannot assign permission '${permission}': exceeds your permissions`);
        }
      }
    }

    await db.transaction(async (trx) => {
      if (body.roles) {
        await trx('user_roles').where({ user_id: userId, tenant_id: tenantId, membership_id: targetMembership.id }).delete();
        const roles = await trx('roles').where({ tenant_id: tenantId }).whereIn('slug', body.roles).select('id', 'slug');
        for (const role of roles) {
          await trx('user_roles').insert({
            user_id: userId, role_id: role.id, tenant_id: tenantId, membership_id: targetMembership.id, assigned_by: actorId,
          });
        }
      }
      if (body.permissions || body.denials) {
        await trx('user_permissions').where({ user_id: userId, tenant_id: tenantId, membership_id: targetMembership.id }).delete();
        const rows = [
          ...expandPermissionInputs(body.permissions || [], 'tenant', 'ALLOW'),
          ...expandPermissionInputs(body.denials || [], 'tenant', 'DENY'),
        ];
        for (const row of rows) {
          await trx('user_permissions').insert({
            user_id: userId,
            tenant_id: tenantId,
            membership_id: targetMembership.id,
            permission: row.permission,
            scope: row.scope,
            effect: row.effect,
            assigned_by: actorId,
          });
        }
      }
      // Keep legacy columns in sync for backward compatibility; bump perm_version
      // so cached principals are invalidated.
      const updateData: Record<string, unknown> = { perm_version: trx.raw('perm_version + 1') };
      if (body.roles) updateData.roles = JSON.stringify(body.roles);
      if (body.permissions || body.denials) updateData.permissions = JSON.stringify([...(body.permissions || []), ...(body.denials || []).map((permission) => `deny:${permission}`)]);
      await trx('users').where({ id: userId, tenant_id: tenantId }).update(updateData);
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'user.permissions_updated',
      entityType: 'user',
      entityId: userId,
      metadata: { membershipId: targetMembership.id, roles: body.roles, permissions: body.permissions, denials: body.denials },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    // Permission changes take effect immediately (principal is loaded per
    // request); revoke the target's sessions/tokens for defense in depth.
    await invalidateAuthorizationCache(userId, String(targetMembership.id));
    await revokeAllUserTokens(userId, tenantId);
    await db('user_sessions').where({ user_id: userId, tenant_id: tenantId, is_active: true }).update({ is_active: false });
    return sendSuccess(reply, { userId, membershipId: targetMembership.id, ...body }, 'Permissions updated');
  });

  // ── Create custom role ──
  app.post('/api/v1/rbac/roles', { preHandler: [authenticate, authorize('roles.create')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const body = z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'slug must be lowercase letters, numbers, underscore'),
      description: z.string().optional(),
      scopeDefault: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']).optional().default('tenant'),
      grants: z.array(z.object({ permission: z.string().min(1), scope: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']) })).optional().default([]),
      denials: z.array(z.object({ permission: z.string().min(1), scope: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']) })).optional().default([]),
    }).parse(request.body);

    const existing = await db('roles').where({ tenant_id: tenantId, slug: body.slug }).first();
    if (existing) throw new ForbiddenError(`Role '${body.slug}' already exists in this organization`);

    // Validate every grant against the catalog and the actor's own grants (no escalation).
    const isSuper = hasPermission(principal, '*');
    const expanded = new Set<string>();
    for (const [effect, inputs] of [['ALLOW', body.grants], ['DENY', body.denials]] as const) {
      for (const grant of inputs) {
        const keys = grant.permission === '*' ? allPermissionKeys() : expandGrantKey(grant.permission);
        for (const permission of keys) {
          if (!isSuper && !hasPermission(principal, permission, grant.scope as PermissionScope)) {
            throw new ForbiddenError(`Cannot ${effect.toLowerCase()} '${permission}' at scope '${grant.scope}': exceeds your permissions`);
          }
          expanded.add(`${permission}:${grant.scope}:${effect}`);
        }
      }
    }

    const role = await db.transaction(async (trx) => {
      const [inserted] = await trx('roles').insert({
        tenant_id: tenantId,
        name: body.name,
        slug: body.slug,
        description: body.description || null,
        permissions: '[]',
        is_system: false,
        level: 'custom',
        scope_default: body.scopeDefault,
      }).returning('*');
      for (const key of expanded) {
        const [permission, scope, effect] = key.split(':');
        await trx('role_permissions').insert({ role_id: inserted.id, tenant_id: tenantId, permission, scope, effect });
      }
      return inserted;
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'role.created',
      entityType: 'role',
      entityId: role.id,
      metadata: { name: body.name, slug: body.slug, grantCount: expanded.size, denialCount: body.denials.length },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, { id: role.id, name: role.name, slug: role.slug }, 'Role created', 201);
  });

  // ── Update custom role (grants/meta) ──
  app.put('/api/v1/rbac/roles/:roleId', { preHandler: [authenticate, authorize('roles.update')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().nullable().optional(),
      scopeDefault: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']).optional(),
      grants: z.array(z.object({ permission: z.string().min(1), scope: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']) })).optional(),
      denials: z.array(z.object({ permission: z.string().min(1), scope: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']) })).optional(),
    }).parse(request.body);

    const role = await db('roles').where({ id: roleId, tenant_id: tenantId }).first();
    if (!role) return sendError(reply, 'Role not found', 404);
    if (role.slug === 'super_admin') throw new ForbiddenError('The super_admin role cannot be modified');

    const isSuper = hasPermission(principal, '*');
    const expanded = new Set<string>();
    for (const [effect, inputs] of [['ALLOW', body.grants || []], ['DENY', body.denials || []] ] as const) {
      for (const grant of inputs) {
        const keys = grant.permission === '*' ? allPermissionKeys() : expandGrantKey(grant.permission);
        for (const permission of keys) {
          if (!isSuper && !hasPermission(principal, permission, grant.scope as PermissionScope)) {
            throw new ForbiddenError(`Cannot ${effect.toLowerCase()} '${permission}' at scope '${grant.scope}': exceeds your permissions`);
          }
          expanded.add(`${permission}:${grant.scope}:${effect}`);
        }
      }
    }

    const affected = await db.transaction(async (trx) => {
      const updateData: Record<string, unknown> = { updated_at: new Date() };
      if (body.name) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.scopeDefault) updateData.scope_default = body.scopeDefault;
      await trx('roles').where({ id: roleId, tenant_id: tenantId }).update(updateData);

      if (body.grants || body.denials) {
        await trx('role_permissions').where({ role_id: roleId }).delete();
        for (const key of expanded) {
          const [permission, scope, effect] = key.split(':');
          await trx('role_permissions').insert({ role_id: roleId, tenant_id: tenantId, permission, scope, effect });
        }
      }

      // Invalidate cached principals for every user holding this role.
      const userIds = await trx('user_roles').where({ role_id: roleId, tenant_id: tenantId }).select('user_id');
      for (const row of userIds) {
        await trx('users').where({ id: row.user_id, tenant_id: tenantId }).update({ perm_version: trx.raw('perm_version + 1') });
      }
      return userIds;
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'role.updated',
      entityType: 'role',
      entityId: roleId,
      metadata: { changed: Object.keys(body), grantCount: body.grants ? expanded.size : undefined, denialCount: body.denials?.length || 0 },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    for (const row of affected) {
      await invalidateAuthorizationCache(String(row.user_id));
      await revokeAllUserTokens(String(row.user_id), tenantId);
      await db('user_sessions').where({ user_id: row.user_id, tenant_id: tenantId, is_active: true }).update({ is_active: false });
    }
    return sendSuccess(reply, { roleId }, 'Role updated');
  });

  // ── Assign role to a membership ──
  app.post('/api/v1/rbac/roles/:roleId/assign', { preHandler: [authenticate, authorize('roles.assign')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);
    const body = z.object({ userId: z.string().uuid(), membershipId: z.string().uuid().optional() }).parse(request.body);
    const role = await db('roles').where({ id: roleId, tenant_id: tenantId }).first();
    if (!role) return sendError(reply, 'Role not found', 404);
    const roleGrants = await db('role_permissions').where({ role_id: roleId }).select('permission', 'scope');
    const isSuper = hasPermission(principal, '*');
    for (const grant of roleGrants) {
      if (!isSuper && !hasPermission(principal, String(grant.permission), grant.scope as PermissionScope)) {
        throw new ForbiddenError(`Cannot assign role '${role.slug}': exceeds your permissions`);
      }
    }
    const membership = await resolveTargetMembership(body.userId, tenantId, body.membershipId);
    if (!membership) return sendError(reply, 'Active target membership not found', 404);
    const existing = await db('user_roles').where({ user_id: body.userId, role_id: roleId, tenant_id: tenantId, membership_id: membership.id }).first();
    if (!existing) await db('user_roles').insert({ user_id: body.userId, role_id: roleId, tenant_id: tenantId, membership_id: membership.id, assigned_by: actorId });
    await db('users').where({ id: body.userId, tenant_id: tenantId }).update({ perm_version: db.raw('perm_version + 1') });
    await invalidateAuthorizationCache(body.userId, String(membership.id));
    await revokeAllUserTokens(body.userId, tenantId);
    await logAudit({ tenantId, userId: actorId, action: 'role.assigned', entityType: 'role', entityId: roleId, metadata: { targetUserId: body.userId, membershipId: membership.id } });
    return sendSuccess(reply, { roleId, userId: body.userId, membershipId: membership.id }, 'Role assigned');
  });

  // ── Remove role from a membership ──
  app.delete('/api/v1/rbac/roles/:roleId/assign', { preHandler: [authenticate, authorize('roles.assign')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);
    const body = z.object({ userId: z.string().uuid(), membershipId: z.string().uuid().optional() }).parse(request.body);
    const membership = await resolveTargetMembership(body.userId, tenantId, body.membershipId);
    if (!membership) return sendError(reply, 'Active target membership not found', 404);
    const removed = await db('user_roles').where({ user_id: body.userId, role_id: roleId, tenant_id: tenantId, membership_id: membership.id }).delete();
    if (!removed) return sendError(reply, 'Role assignment not found', 404);
    await db('users').where({ id: body.userId, tenant_id: tenantId }).update({ perm_version: db.raw('perm_version + 1') });
    await invalidateAuthorizationCache(body.userId, String(membership.id));
    await revokeAllUserTokens(body.userId, tenantId);
    await logAudit({ tenantId, userId: actorId, action: 'role.removed', entityType: 'role', entityId: roleId, metadata: { targetUserId: body.userId, membershipId: membership.id } });
    return sendSuccess(reply, { roleId, userId: body.userId, membershipId: membership.id }, 'Role removed');
  });

  // ── Delete custom role ──
  app.delete('/api/v1/rbac/roles/:roleId', { preHandler: [authenticate, authorize('roles.delete')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);

    const role = await db('roles').where({ id: roleId, tenant_id: tenantId }).first();
    if (!role) return sendError(reply, 'Role not found', 404);
    if (role.is_system) throw new ForbiddenError('System roles cannot be deleted');

    const affectedUsers = await db('user_roles').where({ role_id: roleId, tenant_id: tenantId }).distinct('user_id');
    await db.transaction(async (trx) => {
      await trx('role_permissions').where({ role_id: roleId }).delete();
      await trx('user_roles').where({ role_id: roleId, tenant_id: tenantId }).delete();
      await trx('roles').where({ id: roleId, tenant_id: tenantId }).delete();
      for (const row of affectedUsers) {
        await trx('users').where({ id: row.user_id, tenant_id: tenantId }).update({ perm_version: trx.raw('perm_version + 1') });
      }
    });
    for (const row of affectedUsers) {
      await invalidateAuthorizationCache(String(row.user_id));
      await revokeAllUserTokens(String(row.user_id), tenantId);
      await db('user_sessions').where({ user_id: row.user_id, tenant_id: tenantId, is_active: true }).update({ is_active: false });
    }

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'role.deleted',
      entityType: 'role',
      entityId: roleId,
      metadata: { name: role.name, slug: role.slug },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, { roleId }, 'Role deleted');
  });
}
