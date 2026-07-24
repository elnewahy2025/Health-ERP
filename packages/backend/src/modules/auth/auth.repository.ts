import { db } from '../../core/database.js';
import crypto from 'crypto';

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

export async function createSession(data: Record<string, unknown>) {
  await db('user_sessions').insert(data);
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

export async function updateSessionActivity(userId: string, tenantId: string, tokenHash: string) {
  await db('user_sessions')
    .where({ user_id: userId, tenant_id: tenantId, is_active: true })
    .where('token_hash', tokenHash)
    .update({ last_activity_at: new Date() });
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

    const [adminRole] = await trx('roles').insert({
      tenant_id: tenant.id, name: 'Super Admin', slug: 'super_admin',
      description: 'Full system access',
      permissions: JSON.stringify([
        'patient:read', 'patient:write', 'patient:delete',
        'appointment:read', 'appointment:write', 'appointment:delete',
        'emr:read', 'emr:write', 'emr:delete',
        'billing:read', 'billing:write', 'billing:delete',
        'admin:access', 'admin:users', 'admin:settings',
        'settings:read', 'settings:write', 'audit:read',
      ]),
      is_system: true,
    }).returning('*');

    const [user] = await trx('users').insert({
      tenant_id: tenant.id, email: data.adminEmail, password_hash: data.passwordHash,
      first_name: data.adminFirstName, last_name: data.adminLastName,
      role_id: adminRole.id, roles: JSON.stringify(['super_admin']),
      permissions: JSON.stringify([
        'patient:read', 'patient:write', 'patient:delete',
        'appointment:read', 'appointment:write', 'appointment:delete',
        'emr:read', 'emr:write', 'emr:delete',
        'billing:read', 'billing:write', 'billing:delete',
        'admin:access', 'admin:users', 'admin:settings',
        'settings:read', 'settings:write', 'audit:read',
      ]),
      locale: data.locale, status: 'active', mfa_enabled: false,
      email_verification_token: data.verificationToken, email_verified: false,
    }).returning('*');

    return { tenant, user, verificationToken: data.verificationToken };
  });
}
