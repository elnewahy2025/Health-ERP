import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PERMISSION_CATALOG,
  SEED_ROLES,
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
import { loadUserPrincipal, uniquePermissionKeys, hasPermission } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { revokeAllUserTokens } from '../../services/refresh-token.js';

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

  // Get role templates + tenant roles (custom roles created via this API)
  app.get('/api/v1/rbac/roles', { preHandler: [authenticate, authorize('roles.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const templates = Object.entries(SEED_ROLES).map(([slug, template]) => ({
      id: null,
      slug,
      name: slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      level: template.level,
      scopeDefault: template.scopeDefault,
      description: template.description || null,
      isSystem: true,
      grants: expandRoleGrants(template),
    }));

    const dbRoles = await db('roles').where({ tenant_id: tenantId }).select('*');
    const merged: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const t of templates) {
      seen.add(String(t.slug));
      merged.push(t);
    }
    for (const role of dbRoles) {
      if (seen.has(String(role.slug))) continue;
      const grants = await db('role_permissions').where({ role_id: role.id }).select('permission', 'scope');
      merged.push({
        id: role.id,
        slug: role.slug,
        name: role.name,
        level: role.level || 'custom',
        scopeDefault: role.scope_default || 'tenant',
        description: role.description || null,
        isSystem: Boolean(role.is_system),
        grants: grants.map((g) => ({ permission: String(g.permission), scope: String(g.scope) })),
      });
    }
    return sendSuccess(reply, merged);
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
      isSuperAdmin: principal.roles.includes('super_admin'),
    });
  });

  // Update user roles/permissions with privilege-escalation protection
  app.put('/api/v1/rbac/users/:userId/permissions', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep), authorize('users.assign')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      roles: z.array(z.string()).optional(),
      permissions: z.array(z.string()).optional(),
    }).parse(request.body);

    const target = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!target) return sendError(reply, 'User not found', 404);

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
    if (body.permissions) {
      for (const raw of body.permissions) {
        const keys = raw === '*' ? allPermissionKeys() : expandGrantKey(raw);
        for (const permission of keys) {
          if (!isSuper && !hasPermission(principal, permission)) {
            throw new ForbiddenError(`Cannot assign permission '${permission}': exceeds your permissions`);
          }
        }
      }
    }

    await db.transaction(async (trx) => {
      if (body.roles) {
        await trx('user_roles').where({ user_id: userId, tenant_id: tenantId }).delete();
        const roles = await trx('roles').where({ tenant_id: tenantId }).whereIn('slug', body.roles).select('id', 'slug');
        for (const role of roles) {
          await trx('user_roles').insert({
            user_id: userId, role_id: role.id, tenant_id: tenantId, assigned_by: actorId,
          });
        }
      }
      if (body.permissions) {
        await trx('user_permissions').where({ user_id: userId, tenant_id: tenantId }).delete();
        const seen = new Set<string>();
        for (const raw of body.permissions) {
          const keys = raw === '*' ? allPermissionKeys() : expandGrantKey(raw);
          for (const permission of keys) {
            if (seen.has(permission)) continue;
            seen.add(permission);
            await trx('user_permissions').insert({
              user_id: userId, tenant_id: tenantId, permission, scope: 'tenant', assigned_by: actorId,
            });
          }
        }
      }
      // Keep legacy columns in sync for backward compatibility; bump perm_version
      // so cached principals are invalidated.
      const updateData: Record<string, unknown> = { perm_version: trx.raw('perm_version + 1') };
      if (body.roles) updateData.roles = JSON.stringify(body.roles);
      if (body.permissions) updateData.permissions = JSON.stringify(body.permissions);
      await trx('users').where({ id: userId, tenant_id: tenantId }).update(updateData);
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'user.permissions_updated',
      entityType: 'user',
      entityId: userId,
      metadata: { roles: body.roles, permissions: body.permissions },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    // Permission changes take effect immediately (principal is loaded per
    // request); revoke the target's sessions/tokens for defense in depth.
    await revokeAllUserTokens(userId, tenantId);
    await db('user_sessions').where({ user_id: userId, tenant_id: tenantId, is_active: true }).update({ is_active: false });
    return sendSuccess(reply, { userId, ...body }, 'Permissions updated');
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
    }).parse(request.body);

    const existing = await db('roles').where({ tenant_id: tenantId, slug: body.slug }).first();
    if (existing) throw new ForbiddenError(`Role '${body.slug}' already exists in this organization`);

    // Validate every grant against the catalog and the actor's own grants (no escalation).
    const isSuper = hasPermission(principal, '*');
    const expanded = new Set<string>();
    for (const grant of body.grants) {
      const keys = grant.permission === '*' ? allPermissionKeys() : expandGrantKey(grant.permission);
      for (const permission of keys) {
        if (!isSuper && !hasPermission(principal, permission, grant.scope as PermissionScope)) {
          throw new ForbiddenError(`Cannot grant '${permission}' at scope '${grant.scope}': exceeds your permissions`);
        }
        expanded.add(`${permission}:${grant.scope}`);
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
        const [permission, scope] = key.split(':');
        await trx('role_permissions').insert({ role_id: inserted.id, tenant_id: tenantId, permission, scope });
      }
      return inserted;
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'role.created',
      entityType: 'role',
      entityId: role.id,
      metadata: { name: body.name, slug: body.slug, grantCount: expanded.size },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, { id: role.id, name: role.name, slug: role.slug }, 'Role created', 201);
  });

  // ── Update custom role (grants/meta) ──
  app.put('/api/v1/rbac/roles/:roleId', { preHandler: [authenticate, authorize('roles.edit')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().nullable().optional(),
      scopeDefault: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']).optional(),
      grants: z.array(z.object({ permission: z.string().min(1), scope: z.enum(['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system']) })).optional(),
    }).parse(request.body);

    const role = await db('roles').where({ id: roleId, tenant_id: tenantId }).first();
    if (!role) return sendError(reply, 'Role not found', 404);
    if (role.slug === 'super_admin') throw new ForbiddenError('The super_admin role cannot be modified');

    const isSuper = hasPermission(principal, '*');
    const expanded = new Set<string>();
    if (body.grants) {
      for (const grant of body.grants) {
        const keys = grant.permission === '*' ? allPermissionKeys() : expandGrantKey(grant.permission);
        for (const permission of keys) {
          if (!isSuper && !hasPermission(principal, permission, grant.scope as PermissionScope)) {
            throw new ForbiddenError(`Cannot grant '${permission}' at scope '${grant.scope}': exceeds your permissions`);
          }
          expanded.add(`${permission}:${grant.scope}`);
        }
      }
    }

    const affected = await db.transaction(async (trx) => {
      const updateData: Record<string, unknown> = { updated_at: new Date() };
      if (body.name) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.scopeDefault) updateData.scope_default = body.scopeDefault;
      await trx('roles').where({ id: roleId, tenant_id: tenantId }).update(updateData);

      if (body.grants) {
        await trx('role_permissions').where({ role_id: roleId }).delete();
        for (const key of expanded) {
          const [permission, scope] = key.split(':');
          await trx('role_permissions').insert({ role_id: roleId, tenant_id: tenantId, permission, scope });
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
      metadata: { changed: Object.keys(body), grantCount: body.grants ? expanded.size : undefined },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    for (const row of affected) {
      await revokeAllUserTokens(String(row.user_id), tenantId);
      await db('user_sessions').where({ user_id: row.user_id, tenant_id: tenantId, is_active: true }).update({ is_active: false });
    }
    return sendSuccess(reply, { roleId }, 'Role updated');
  });

  // ── Delete custom role ──
  app.delete('/api/v1/rbac/roles/:roleId', { preHandler: [authenticate, authorize('roles.delete')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);

    const role = await db('roles').where({ id: roleId, tenant_id: tenantId }).first();
    if (!role) return sendError(reply, 'Role not found', 404);
    if (role.is_system) throw new ForbiddenError('System roles cannot be deleted');

    await db.transaction(async (trx) => {
      await trx('role_permissions').where({ role_id: roleId }).delete();
      await trx('user_roles').where({ role_id: roleId, tenant_id: tenantId }).delete();
      await trx('roles').where({ id: roleId, tenant_id: tenantId }).delete();
    });

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
