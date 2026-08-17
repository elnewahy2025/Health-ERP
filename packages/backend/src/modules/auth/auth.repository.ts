import { db } from '../../core/database.js';
import crypto from 'crypto';
import type { Knex } from 'knex';
import { SEED_ROLES, expandRoleGrants } from '@healthcare/shared/authz';

async function seedSystemRoles(
  trx: Knex.Transaction,
  tenantId: string,
): Promise<Map<string, string>> {
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

// ── Tenants ──

export async function findTenantBySlug(slug: string) {
  return db('tenants').where({ slug }).first();
}

export async function findTenantById(id: string) {
  return db('tenants').where({ id }).first();
}

// ── Users ──

export async function findUserByEmailAndTenant(email: string, tenantId: string) {
  return db('users').where({ email, tenant_id: tenantId }).first();
}

export async function findUserByEmail(email: string) {
  return db('users').where({ email }).first();
}

export async function findUserById(userId: string) {
  return db('users').where({ id: userId }).first();
}

export async function findUserByIdAndTenant(userId: string, tenantId: string) {
  return db('users').where({ id: userId, tenant_id: tenantId }).first();
}

export async function updateUser(userId: string, data: Record<string, unknown>) {
  await db('users').where({ id: userId }).update(data);
}

// ── Account Lockout ──

export async function recordFailedLogin(
  email: string, tenantId: string | null, ipAddress: string, userAgent: string | null,
) {
  await db('login_attempts').insert({
    ip_address: ipAddress, email, tenant_id: tenantId, success: false, user_agent: userAgent,
  });
  const user = await db('users').where({ email }).first();
  if (user) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    const env = (await import('@healthcare/shared/config')).getEnv();
    const update: Record<string, unknown> = { failed_login_attempts: attempts };
    if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
      update.locked_until = new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
    }
    await db('users').where({ id: user.id }).update(update);
  }
}

export async function checkAccountLock(email: string): Promise<{ locked: boolean; remainingMin?: number }> {
  const user = await db('users').where({ email }).first();
  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    const remainingMs = new Date(user.locked_until).getTime() - Date.now();
    return { locked: true, remainingMin: Math.ceil(remainingMs / 60000) };
  }
  return { locked: false };
}

export async function resetFailedLogin(userId: string) {
  await db('users').where({ id: userId }).update({ failed_login_attempts: 0, locked_until: null });
}

export async function recordSuccessfulLogin(
  email: string, tenantId: string | null, ipAddress: string, userAgent: string | null,
) {
  await db('login_attempts').insert({
    ip_address: ipAddress, email, tenant_id: tenantId, success: true, user_agent: userAgent,
  });
}

// ── Sessions ──

export async function countActiveSessions(userId: string, tenantId: string) {
  const result = await db('user_sessions')
    .where({ user_id: userId, tenant_id: tenantId, is_active: true })
    .count('id as count').first();
  return Number(result?.count || 0);
}

export async function deactivateOldestSessions(userId: string, tenantId: string, keepCount: number) {
  const oldest = await db('user_sessions')
    .where({ user_id: userId, tenant_id: tenantId, is_active: true })
    .orderBy('last_activity_at', 'asc')
    .limit(keepCount);
  if (oldest.length > 0) {
    const ids = oldest.map((s: Record<string, unknown>) => String(s.id));
    await db('user_sessions').whereIn('id', ids).update({ is_active: false });
  }
}

export async function createSession(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [session] = await db('user_sessions').insert(data).returning('*');
  return session as Record<string, unknown>;
}

export async function deactivateSession(sessionId: string, userId: string, tenantId: string) {
  await db('user_sessions')
    .where({ id: sessionId, user_id: userId, tenant_id: tenantId })
    .update({ is_active: false });
}

export async function deactivateSessionByIp(userId: string, tenantId: string, ipAddress: string) {
  await db('user_sessions')
    .where({ user_id: userId, tenant_id: tenantId, ip_address: ipAddress, is_active: true })
    .update({ is_active: false });
}

export async function findActiveSessions(userId: string, tenantId: string) {
  return db('user_sessions')
    .where({ user_id: userId, tenant_id: tenantId, is_active: true })
    .select('id', 'device', 'ip_address', 'user_agent', 'last_activity_at', 'created_at')
    .orderBy('last_activity_at', 'desc');
}

export async function findActiveSessionById(sessionId: string, userId: string, tenantId: string) {
  return db('user_sessions')
    .where({ id: sessionId, user_id: userId, tenant_id: tenantId, is_active: true })
    .where('expires_at', '>', new Date())
    .first();
}

export async function findSessionByTokenHash(tokenHash: string) {
  return db('user_sessions').where({ token_hash: tokenHash, is_active: true }).first();
}

export async function updateSessionActivity(userId: string, tenantId: string, tokenHash: string) {
  await db('user_sessions')
    .where({ user_id: userId, tenant_id: tenantId, is_active: true })
    .where('token_hash', tokenHash)
    .update({ last_activity_at: new Date() });
}

export async function rotateSessionToken(sessionId: string, tokenHash: string) {
  await db('user_sessions').where({ id: sessionId, is_active: true }).update({ token_hash: tokenHash, last_activity_at: new Date() });
}

export async function updateSessionMembership(sessionId: string, userId: string, tenantId: string, membershipId: string) {
  await db('user_sessions')
    .where({ id: sessionId, user_id: userId, tenant_id: tenantId, is_active: true })
    .update({ membership_id: membershipId, last_activity_at: new Date() });
}

// ── Password Resets ──

export async function createPasswordReset(data: Record<string, unknown>) {
  await db('password_resets').insert(data);
}

export async function findPasswordReset(tokenHash: string) {
  return db('password_resets')
    .where({ token_hash: tokenHash })
    .where('expires_at', '>', new Date())
    .first();
}

export async function deletePasswordReset(id: string) {
  await db('password_resets').where({ id }).delete();
}

// ── Email Verification ──

export async function findUserByVerificationToken(token: string) {
  return db('users').where({ email_verification_token: token }).first();
}

// ── MFA ──

export async function storeRecoveryCodes(tenantId: string, userId: string, codes: string[]) {
  for (const code of codes) {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    await db('password_resets').insert({
      tenant_id: tenantId, user_id: userId, token_hash: codeHash,
      type: 'mfa_recovery', expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
  }
}

// ── Roles ──

// ── Refresh Tokens ──

export async function findRefreshTokenByHash(tokenHash: string) {
  return db('refresh_tokens').where({ token_hash: tokenHash }).first();
}

// ── Basic CRUD (used by registration transaction and potentially other consumers) ──

export async function createTenant(data: Record<string, unknown>) {
  const [tenant] = await db('tenants').insert(data).returning('*');
  return tenant;
}

export async function createUser(data: Record<string, unknown>) {
  const [user] = await db('users').insert(data).returning('*');
  return user;
}

export async function createRole(data: Record<string, unknown>) {
  const [role] = await db('roles').insert(data).returning('*');
  return role;
}

// ── Tenant Registration Transaction ──

export async function registerTenantWithAdmin(data: {
  name: string; slug: string; locale: string; settings: string;
  passwordHash: string; adminEmail: string; adminFirstName: string;
  adminLastName: string; verificationToken: string;
}): Promise<{ tenant: Record<string, unknown>; user: Record<string, unknown>; verificationToken: string }> {
  return db.transaction(async (trx) => {
    const [tenant] = await trx('tenants').insert({
      name: data.name, slug: data.slug, locale: data.locale,
      settings: data.settings, status: 'active',
    }).returning('*');

    const roleIds = await seedSystemRoles(trx, tenant.id);
    const adminRoleId = roleIds.get('super_admin');
    if (!adminRoleId) throw new Error('Failed to seed super_admin role');

    const legacyAdminPermissions = [
      'patient:read', 'patient:write', 'patient:delete',
      'appointment:read', 'appointment:write', 'appointment:delete',
      'emr:read', 'emr:write', 'emr:delete',
      'billing:read', 'billing:write', 'billing:delete',
      'admin:access', 'admin:users', 'admin:settings',
      'settings:read', 'settings:write', 'audit:read',
    ];

    const [user] = await trx('users').insert({
      tenant_id: tenant.id, email: data.adminEmail, password_hash: data.passwordHash,
      first_name: data.adminFirstName, last_name: data.adminLastName,
      role_id: adminRoleId, roles: JSON.stringify(['super_admin']),
      permissions: JSON.stringify(legacyAdminPermissions),
      locale: data.locale, status: 'active', mfa_enabled: false,
      email_verification_token: data.verificationToken, email_verified: false,
    }).returning('*');

    await trx('user_roles').insert({
      user_id: user.id,
      role_id: adminRoleId,
      tenant_id: tenant.id,
      assigned_by: user.id,
    });

    return { tenant, user, verificationToken: data.verificationToken };
  });
}
