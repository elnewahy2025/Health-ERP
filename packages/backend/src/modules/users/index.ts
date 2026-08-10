import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { authorize, hasPermission, type Principal } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { revokeAllUserTokens } from '../../services/refresh-token.js';
import { getEnv } from '@healthcare/shared/config';
import { ForbiddenError, ConflictError } from '@healthcare/shared/errors';
import { expandGrantKey, allPermissionKeys, type PermissionScope } from '@healthcare/shared/authz';

const env = getEnv();

const EMPLOYEE_TYPES = [
  'staff', 'doctor', 'nurse', 'pharmacist', 'technician', 'receptionist',
  'accountant', 'manager', 'administrator',
] as const;

async function assertCanAssignGrants(principal: Principal, roleSlugs: string[]) {
  const isSuper = hasPermission(principal, '*');
  if (isSuper) return;
  if (roleSlugs.length === 0) return;
  const roles = await db('roles').where({ tenant_id: principal.tenantId }).whereIn('slug', roleSlugs).select('id', 'slug');
  for (const role of roles) {
    const roleGrants = await db('role_permissions').where({ role_id: role.id }).select('permission', 'scope');
    for (const grant of roleGrants) {
      if (!hasPermission(principal, String(grant.permission), grant.scope as PermissionScope)) {
        throw new ForbiddenError(`Cannot assign role '${role.slug}': exceeds your permissions`);
      }
    }
  }
}

export async function registerUsersModule(app: FastifyInstance) {

  // ── List / search / filter users ──
  app.get('/api/v1/users', { preHandler: [authenticate, authorize('users.view')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
      search: z.string().optional(),
      employeeType: z.string().optional(),
      role: z.string().optional(),
      branchId: z.string().optional(),
      departmentId: z.string().optional(),
      status: z.string().optional(),
      sort: z.string().optional(),
      order: z.enum(['asc', 'desc']).optional().default('desc'),
    }).parse(request.query);

    const base = db('users')
      .where('users.tenant_id', tenantId)
      .leftJoin('user_branches', 'users.id', 'user_branches.user_id');

    if (query.search) {
      base.andWhere(function () {
        this.where('users.first_name', 'ilike', `%${query.search}%`)
          .orWhere('users.last_name', 'ilike', `%${query.search}%`)
          .orWhere('users.email', 'ilike', `%${query.search}%`)
          .orWhere('users.phone', 'ilike', `%${query.search}%`);
      });
    }
    if (query.employeeType) base.andWhere('users.employee_type', query.employeeType);
    if (query.role) {
      base.andWhere(function () {
        this.whereRaw("users.roles::text LIKE ?", [`%"${query.role}"%`])
          .orWhereRaw("EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = users.id AND r.slug = ?)", [String(query.role)]);
      });
    }
    if (query.branchId) base.andWhere('user_branches.branch_id', query.branchId);
    if (query.departmentId) base.andWhere('users.department_id', query.departmentId);
    if (query.status) base.andWhere('users.status', query.status);

    const total = await base.clone().countDistinct('users.id as count').first();
    const users = await base
      .distinct('users.*')
      .orderBy(query.sort || 'users.created_at', query.order)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const result = await Promise.all(users.map(async (u: Record<string, unknown>) => {
      const branchRows = await db('user_branches').where({ user_id: u.id }).select('branch_id');
      return {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        phone: u.phone || null,
        employeeType: u.employee_type || 'staff',
        departmentId: u.department_id || null,
        position: u.position || null,
        status: u.status,
        locale: u.locale || 'en',
        mfaEnabled: Boolean(u.mfa_enabled),
        roles: u.roles || [],
        branches: branchRows.map((b: { branch_id: string }) => b.branch_id),
        lastLoginAt: u.last_login_at || null,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      };
    }));

    await logAudit({ tenantId, userId: actorId, action: 'user.list', entityType: 'user' });
    return sendPaginated(reply, result, Number(total?.count || 0), query.page, query.limit);
  });

  // ── User detail (roles, branches, sessions) ──
  app.get('/api/v1/users/:userId', { preHandler: [authenticate, authorize('users.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);

    const user = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!user) return sendError(reply, 'User not found', 404);

    const [roles, branches, sessions] = await Promise.all([
      db('user_roles')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('user_roles.user_id', userId)
        .andWhere('user_roles.tenant_id', tenantId)
        .select('roles.slug', 'roles.name', 'roles.level', 'roles.scope_default'),
      db('user_branches')
        .join('branches', 'user_branches.branch_id', 'branches.id')
        .where('user_branches.user_id', userId)
        .andWhere('user_branches.tenant_id', tenantId)
        .select('branches.id', 'branches.name', 'branches.code'),
      db('user_sessions').where({ user_id: userId, tenant_id: tenantId, is_active: true }).select('id', 'ip_address', 'user_agent', 'device', 'location', 'last_activity_at', 'expires_at'),
    ]);
    const department = user.department_id ? await db('departments').where({ id: user.department_id, tenant_id: tenantId }).first() : null;

    await logAudit({ tenantId, userId: getCtx(request).userId, action: 'user.view', entityType: 'user', entityId: userId });
    return sendSuccess(reply, {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone || null,
      employeeType: user.employee_type || 'staff',
      department: department ? { id: department.id, name: department.name, code: department.code } : null,
      position: user.position || null,
      professionalInfo: user.professional_info || null,
      status: user.status,
      locale: user.locale || 'en',
      mfaEnabled: Boolean(user.mfa_enabled),
      roles,
      branches,
      sessions,
      lastLoginAt: user.last_login_at || null,
      passwordChangedAt: user.password_changed_at || null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  });

  // ── Create user ──
  app.post('/api/v1/users', { preHandler: [authenticate, authorize('users.create')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const body = z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      employeeType: z.enum(EMPLOYEE_TYPES).optional().default('staff'),
      departmentId: z.string().uuid().optional(),
      position: z.string().optional(),
      professionalInfo: z.record(z.unknown()).optional(),
      roles: z.array(z.string()).optional().default([]),
      branchIds: z.array(z.string().uuid()).optional().default([]),
      locale: z.enum(['en', 'ar']).optional().default('en'),
      temporaryPassword: z.string().min(8).optional(),
    }).parse(request.body);

    if ((body.employeeType as string) === 'patient') {
      return reply.status(400).send({ success: false, error: 'Patients are managed through patient registration, not staff accounts' });
    }
    const existing = await db('users').where({ email: body.email.toLowerCase(), tenant_id: tenantId }).first();
    if (existing) throw new ConflictError('A user with this email already exists in this organization');

    await assertCanAssignGrants(principal, body.roles);
    if (body.branchIds.length > 0) {
      const branches = await db('branches').where({ tenant_id: tenantId }).whereIn('id', body.branchIds).select('id');
      if (branches.length !== body.branchIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more branches are not in this organization' });
      }
    }
    if (body.departmentId) {
      const dept = await db('departments').where({ id: body.departmentId, tenant_id: tenantId }).first();
      if (!dept) return reply.status(400).send({ success: false, error: 'Department not found in this organization' });
    }

    const tempPassword = body.temporaryPassword || crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, Number(env.BCRYPT_ROUNDS || 10));

    const inserted = await db.transaction(async (trx) => {
      const roleIds = body.roles.length > 0
        ? await trx('roles').where({ tenant_id: tenantId }).whereIn('slug', body.roles).select('id', 'slug')
        : [];
      const [user] = await trx('users').insert({
        tenant_id: tenantId,
        email: body.email.toLowerCase(),
        phone: body.phone || null,
        password_hash: passwordHash,
        first_name: body.firstName,
        last_name: body.lastName,
        employee_type: body.employeeType,
        department_id: body.departmentId || null,
        position: body.position || null,
        professional_info: body.professionalInfo ? JSON.stringify(body.professionalInfo) : null,
        roles: JSON.stringify(roleIds.map((r: { slug: string }) => r.slug)),
        permissions: '[]',
        locale: body.locale,
        status: 'active',
        created_by: actorId,
        branch_id: body.branchIds[0] || null,
      }).returning('*');

      for (const role of roleIds) {
        await trx('user_roles').insert({ user_id: user.id, role_id: role.id, tenant_id: tenantId, assigned_by: actorId });
      }
      for (const branchId of body.branchIds) {
        await trx('user_branches').insert({ user_id: user.id, branch_id: branchId, tenant_id: tenantId });
      }
      if (roleIds.length > 0) {
        await trx('users').where({ id: user.id }).update({ role_id: roleIds[0].id });
      }
      return user;
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'user.created',
      entityType: 'user',
      entityId: inserted.id,
      metadata: { employeeType: body.employeeType, roles: body.roles, branches: body.branchIds },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, {
      id: inserted.id,
      email: inserted.email,
      temporaryPassword: tempPassword,
      note: 'Share the temporary password securely with the user. They should change it on first login.',
    }, 'User created', 201);
  });

  // ── Update user profile (identity fields, department, position, branches, roles) ──
  app.put('/api/v1/users/:userId', { preHandler: [authenticate, authorize('users.edit')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      phone: z.string().nullable().optional(),
      employeeType: z.enum(EMPLOYEE_TYPES).optional(),
      departmentId: z.string().uuid().nullable().optional(),
      position: z.string().nullable().optional(),
      professionalInfo: z.record(z.unknown()).optional(),
      branchIds: z.array(z.string().uuid()).optional(),
      roles: z.array(z.string()).optional(),
      locale: z.enum(['en', 'ar']).optional(),
    }).parse(request.body);

    const existing = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!existing) return sendError(reply, 'User not found', 404);
    if (userId === principal.id && body.roles !== undefined) {
      throw new ForbiddenError('You cannot change your own roles');
    }

    if (body.roles) await assertCanAssignGrants(principal, body.roles);
    if (body.branchIds) {
      const branches = await db('branches').where({ tenant_id: tenantId }).whereIn('id', body.branchIds).select('id');
      if (branches.length !== body.branchIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more branches are not in this organization' });
      }
    }

    await db.transaction(async (trx) => {
      const updateData: Record<string, unknown> = { updated_at: new Date() };
      if (body.firstName) updateData.first_name = body.firstName;
      if (body.lastName) updateData.last_name = body.lastName;
      if (body.phone !== undefined) updateData.phone = body.phone;
      if (body.employeeType) updateData.employee_type = body.employeeType;
      if (body.departmentId !== undefined) updateData.department_id = body.departmentId;
      if (body.position !== undefined) updateData.position = body.position;
      if (body.professionalInfo !== undefined) updateData.professional_info = JSON.stringify(body.professionalInfo);
      if (body.locale) updateData.locale = body.locale;

      if (body.roles) {
        const roleIds = await trx('roles').where({ tenant_id: tenantId }).whereIn('slug', body.roles).select('id', 'slug');
        await trx('user_roles').where({ user_id: userId, tenant_id: tenantId }).delete();
        for (const role of roleIds) {
          await trx('user_roles').insert({ user_id: userId, role_id: role.id, tenant_id: tenantId, assigned_by: actorId });
        }
        updateData.roles = JSON.stringify(roleIds.map((r: { slug: string }) => r.slug));
        updateData.role_id = roleIds[0]?.id || null;
      }
      if (body.branchIds) {
        await trx('user_branches').where({ user_id: userId, tenant_id: tenantId }).delete();
        for (const branchId of body.branchIds) {
          await trx('user_branches').insert({ user_id: userId, branch_id: branchId, tenant_id: tenantId });
        }
        updateData.branch_id = body.branchIds[0] || null;
      }
      await trx('users').where({ id: userId, tenant_id: tenantId }).update(updateData);
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'user.updated',
      entityType: 'user',
      entityId: userId,
      metadata: { changed: Object.keys(body) },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, { userId }, 'User updated');
  });

  // ── Activate / deactivate / suspend ──
  app.put('/api/v1/users/:userId/status', { preHandler: [authenticate, authorize('users.manage')] }, async (request, reply) => {
    const { tenantId, principal, userId: actorId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.enum(['active', 'inactive', 'suspended']) }).parse(request.body);

    if (userId === principal.id) throw new ForbiddenError('You cannot change your own account status');
    const existing = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!existing) return sendError(reply, 'User not found', 404);
    const existingRoles = existing.roles ? (typeof existing.roles === 'string' ? JSON.parse(existing.roles) : existing.roles) : [];
    if (Array.isArray(existingRoles) && existingRoles.includes('super_admin')) {
      throw new ForbiddenError('Super administrator accounts cannot be deactivated');
    }

    await db('users').where({ id: userId, tenant_id: tenantId }).update({ status: body.status, updated_at: new Date() });

    if (body.status !== 'active') {
      await revokeAllUserTokens(userId, tenantId);
      await db('user_sessions').where({ user_id: userId, tenant_id: tenantId, is_active: true }).update({ is_active: false });
    }

    await logAudit({
      tenantId,
      userId: actorId,
      action: `user.status_${body.status}`,
      entityType: 'user',
      entityId: userId,
      metadata: { previousStatus: existing.status },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, { userId, status: body.status }, `User ${body.status}`);
  });

  // ── Admin password reset ──
  app.post('/api/v1/users/:userId/reset-password', { preHandler: [authenticate, authorize('users.manage')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);

    const existing = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!existing) return sendError(reply, 'User not found', 404);

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, Number(env.BCRYPT_ROUNDS || 10));
    await db('users').where({ id: userId, tenant_id: tenantId }).update({
      password_hash: passwordHash,
      password_changed_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date(),
    });
    await revokeAllUserTokens(userId, tenantId);
    await db('user_sessions').where({ user_id: userId, tenant_id: tenantId, is_active: true }).update({ is_active: false });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'user.password_reset_by_admin',
      entityType: 'user',
      entityId: userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, {
      userId,
      temporaryPassword: tempPassword,
      note: 'Share the temporary password securely. User must change it on next login.',
    }, 'Password reset');
  });

  // ── Force logout (revoke all sessions) ──
  app.post('/api/v1/users/:userId/force-logout', { preHandler: [authenticate, authorize('users.manage')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);

    const existing = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!existing) return sendError(reply, 'User not found', 404);

    await revokeAllUserTokens(userId, tenantId);
    const revoked = await db('user_sessions').where({ user_id: userId, tenant_id: tenantId, is_active: true }).update({ is_active: false });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'user.force_logout',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: revoked },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });
    return sendSuccess(reply, { userId, revokedSessions: revoked }, 'All sessions revoked');
  });

  // ── Audit history for a user ──
  app.get('/api/v1/users/:userId/audit', { preHandler: [authenticate, authorize('users.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
    }).parse(request.query);

    const total = await db('audit_logs').where({ tenant_id: tenantId, user_id: userId }).count('id as count').first();
    const logs = await db('audit_logs')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('timestamp', 'desc')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return sendPaginated(reply, logs, Number(total?.count || 0), query.page, query.limit);
  });
}
