import type { FastifyRequest, FastifyReply } from 'fastify';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess } from '../../utils/response.js';
import { UnauthorizedError, ConflictError } from '@healthcare/shared/errors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logAudit } from '../../services/audit.js';
import { generateTokenPair, rotateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from '../../services/refresh-token.js';
import { generateSecret, verifyToken, generateQrCode } from '../../services/totp.js';
import { createAndSendOtp, verifyOtp, incrementOtpAttempt } from '../../services/otp.js';
import { sendEmail } from '../../services/email.js';
import { getEnv } from '@healthcare/shared/config';
import { clinicConfigurationDefinition } from '@healthcare/shared/config/clinic-configuration';
import { getDefaultMembershipForUser, loadUserPrincipal, loadUserPrincipalByMembership, uniquePermissionKeys, invalidateAuthorizationCache, type Principal } from '../../services/authorization.js';
import { db } from '../../core/database.js';
import * as svc from './auth.service.js';
import * as repo from './auth.repository.js';
import {
  registerTenantSchema, loginSchema, mfaVerifySchema,
  logoutSchema, sessionIdSchema, forgotPasswordSchema, resetPasswordSchema,
  changePasswordSchema, verifyEmailSchema, resendVerificationSchema,
  mfaEnableSchema, mfaDisableSchema, otpSendSchema, otpVerifySchema,
} from './auth.schema.js';
const env = getEnv();
const DEFAULT_CLINIC_CURRENCY = String(clinicConfigurationDefinition('clinic.finance.currency')?.defaultValue || '');
const DEFAULT_CLINIC_TIMEZONE = String(clinicConfigurationDefinition('clinic.timezone.default')?.defaultValue || 'UTC');

function parseRoles(value: unknown): string[] {
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

/**
 * Canonical authenticated-user payload shared by login, MFA verify, and me().
 * Permissions and grant scopes are the effective grants (roles + direct) derived
 * server-side — the frontend must never receive a stale/legacy shape that hides grants.
 */
function buildUserResponse(user: Record<string, unknown>, principal: Principal | null) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    roles: principal?.roles || parseRoles(user.roles),
    permissions: principal ? uniquePermissionKeys(principal.grants) : [],
    grants: principal?.grants.map((grant) => ({ permission: grant.permission, scope: grant.scope })) || [],
    branches: principal?.branches || [],
    employeeType: user.employee_type || 'staff',
    departmentId: user.department_id || null,
    position: user.position || null,
    locale: user.locale || 'en',
    status: user.status,
    mfaEnabled: Boolean(user.mfa_enabled),
    passwordChangedAt: user.password_changed_at || null,
  };
}

export async function registerTenant(request: FastifyRequest, reply: FastifyReply) {
  const body = registerTenantSchema.parse(request.body);
  if (body.website && body.website.length > 0) {
    return sendSuccess(reply, { message: 'Registration successful. Please verify your email.' }, 'Registration successful', 201);
  }

  const existingSlug = await repo.findTenantBySlug(body.slug);
  if (existingSlug) throw new ConflictError('Organization slug already taken');

  const existingEmail = await repo.findUserByEmail(body.adminEmail);
  if (existingEmail) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(body.adminPassword, env.BCRYPT_ROUNDS);
  const verificationToken = svc.generateVerificationToken();

  const result = await repo.registerTenantWithAdmin({
    name: body.name, slug: body.slug, locale: body.locale,
    settings: JSON.stringify({
      dateFormat: body.locale === 'ar' ? 'DD/MM/YYYY' : 'MM/DD/YYYY',
      currency: DEFAULT_CLINIC_CURRENCY, timezone: DEFAULT_CLINIC_TIMEZONE,
      theme: { primaryColor: '#0ea5e9', brandName: body.name },
      language: body.locale, direction: body.locale === 'ar' ? 'rtl' : 'ltr',
      features: {},
    }),
    passwordHash, adminEmail: body.adminEmail,
    adminFirstName: body.adminName.split(' ')[0],
    adminLastName: body.adminName.split(' ').slice(1).join(' ') || '',
    verificationToken,
  });

  await logAudit({ tenantId: String(result.tenant.id), userId: String(result.user.id), action: 'tenant.created' });

  try {
    const verifyUrl = `${env.APP_URL}/verify-email?token=${result.verificationToken}`;
    await sendEmail({
      to: body.adminEmail, subject: `Verify your email — ${result.tenant.name}`,
      html: `<p>Welcome to ${result.tenant.name}!</p><p>Please verify your email by clicking: <a href="${verifyUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
    });
  } catch { /* best-effort */ }

  return sendSuccess(reply, {
    tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
    message: 'Registration successful. Please verify your email.',
  }, 'Tenant created', 201);
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const body = loginSchema.parse(request.body);
  const ip = request.ip ?? '127.0.0.1';
  const userAgent = (request.headers['user-agent'] as string) || null;

  await svc.checkAccountLock(body.email);

  const tenant = await repo.findTenantBySlug(body.tenantSlug);
  if (!tenant) throw new UnauthorizedError('Invalid organization');

  const user = await repo.findUserByEmailAndTenant(body.email, tenant.id);
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    await svc.recordFailedLogin(body.email, tenant.id, ip, userAgent);
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status !== 'active') throw new UnauthorizedError('Account is not active');

  await svc.recordSuccessfulLogin(body.email, tenant.id, ip, userAgent);
  await svc.resetFailedLogin(user.id);

  if (user.mfa_enabled) {
    const jwt = svc.getJwtHelper(request.server);
    const partialToken = jwt.sign({ tenantId: tenant.id, userId: user.id, mfaPending: true }, { expiresIn: '5m' });
    return sendSuccess(reply, { mfaRequired: true, partialToken, userId: user.id });
  }

  const jwt = svc.getJwtHelper(request.server);
  const membership = await getDefaultMembershipForUser(String(user.id), String(tenant.id));
  const { refreshToken } = await generateTokenPair(user.id, tenant.id, ip, userAgent, membership?.id);
  await svc.enforceSessionLimit(user.id, tenant.id);
  const session = await svc.createSessionRecord(tenant.id, user.id, refreshToken, ip, userAgent, membership?.id);
  const accessToken = svc.generateAccessToken(jwt, tenant.id, user.id, membership?.id, String(session.id));
  await logAudit({ tenantId: tenant.id, userId: user.id, action: 'user.login', ipAddress: ip, userAgent, metadata: { membershipId: membership?.id, sessionId: session.id } });

  const csrfToken = svc.generateCsrfToken();
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict',
    path: '/', maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  });
  reply.setCookie('csrf_token', svc.hashCsrfToken(csrfToken), {
    httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict',
    path: '/', maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  });

  const principal = await loadUserPrincipal(user.id, tenant.id);
  return sendSuccess(reply, {
    accessToken, csrfToken, expiresIn: 3600,
    user: buildUserResponse(user, principal),
    tenant: {
      id: tenant.id, name: tenant.name, slug: tenant.slug,
      locale: tenant.locale, direction: tenant.settings?.direction || (tenant.locale === 'ar' ? 'rtl' : 'ltr'),
      settings: tenant.settings ?? {},
    },
  });
}

export async function mfaVerify(request: FastifyRequest, reply: FastifyReply) {
  const { code, partialToken } = mfaVerifySchema.parse(request.body);
  const ip = request.ip ?? '127.0.0.1';
  const userAgent = (request.headers['user-agent'] as string) || null;

  let decoded: { tenantId: string; userId: string; mfaPending: boolean };
  try { decoded = svc.getJwtHelper(request.server).verify(partialToken) as { tenantId: string; userId: string; mfaPending: boolean }; }
  catch { throw new UnauthorizedError('Invalid or expired token'); }

  if (!decoded.mfaPending) throw new UnauthorizedError('Invalid token');

  const user = await repo.findUserById(decoded.userId);
  if (!user || !user.mfa_secret) throw new UnauthorizedError('MFA not configured');

  const valid = verifyToken(code, user.mfa_secret);
  if (!valid) throw new UnauthorizedError('Invalid MFA code');

  const tenant = await repo.findTenantById(decoded.tenantId);
  if (!tenant) throw new UnauthorizedError('Invalid organization');

  const jwt = svc.getJwtHelper(request.server);
  const membership = await getDefaultMembershipForUser(String(user.id), String(tenant.id));
  const { refreshToken } = await generateTokenPair(user.id, tenant.id, ip, userAgent, membership?.id);
  await svc.enforceSessionLimit(user.id, tenant.id);
  const session = await svc.createSessionRecord(tenant.id, user.id, refreshToken, ip, userAgent, membership?.id);
  const accessToken = svc.generateAccessToken(jwt, tenant.id, user.id, membership?.id, String(session.id));
  await logAudit({ tenantId: tenant.id, userId: user.id, action: 'user.login.mfa', ipAddress: ip, metadata: { membershipId: membership?.id, sessionId: session.id } });

  const csrfToken = svc.generateCsrfToken();
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict',
    path: '/', maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  });
  reply.setCookie('csrf_token', svc.hashCsrfToken(csrfToken), {
    httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict',
    path: '/', maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  });

  const principal = await loadUserPrincipal(user.id, tenant.id);
  return sendSuccess(reply, {
    accessToken, csrfToken, expiresIn: 3600,
    user: buildUserResponse(user, principal),
  });
}

export async function refreshToken(request: FastifyRequest, reply: FastifyReply) {
  // Accept the token from the body (API clients) or the HttpOnly refresh_token cookie
  // (browser session restore — the frontend cannot read the cookie to send it in the body).
  const body = (request.body ?? {}) as Record<string, unknown>;
  const bodyToken = typeof body.refreshToken === 'string' ? body.refreshToken : undefined;
  const oldToken = bodyToken || request.cookies?.refresh_token;
  if (!oldToken) throw new UnauthorizedError('Missing refresh token');
  const ip = request.ip ?? '127.0.0.1';
  const userAgent = (request.headers['user-agent'] as string) || null;

  const oldTokenHash = crypto.createHash('sha256').update(oldToken).digest('hex');
  const oldRecord = await repo.findRefreshTokenByHash(oldTokenHash);
  if (!oldRecord) throw new UnauthorizedError('Invalid refresh token');

  if (oldRecord.user_agent && userAgent && oldRecord.user_agent !== userAgent) {
    await revokeAllUserTokens(oldRecord.user_id, oldRecord.tenant_id);
    await logAudit({ tenantId: oldRecord.tenant_id, userId: oldRecord.user_id, action: 'user.token_agent_mismatch' });
    throw new UnauthorizedError('Session from different device. All sessions revoked for security.');
  }

  if (oldRecord.is_revoked) {
    await revokeAllUserTokens(oldRecord.user_id, oldRecord.tenant_id);
    await logAudit({ tenantId: oldRecord.tenant_id, userId: oldRecord.user_id, action: 'user.token_family_reuse_detected' });
    throw new UnauthorizedError('Refresh token reuse detected. All sessions revoked.');
  }

  const result = await rotateRefreshToken(oldToken, ip, userAgent);
  if (!result) throw new UnauthorizedError('Invalid or expired refresh token');

  const user = await repo.findUserById(oldRecord.user_id);
  if (!user || user.status !== 'active') throw new UnauthorizedError('Account is not active');

  const membership = oldRecord.membership_id
    ? await loadUserPrincipalByMembership(String(user.id), String(oldRecord.membership_id))
    : await getDefaultMembershipForUser(String(user.id), String(oldRecord.tenant_id));
  if (oldRecord.membership_id && !membership) throw new UnauthorizedError('Membership is not active');
  const membershipId = oldRecord.membership_id
    ? String(oldRecord.membership_id)
    : (membership && 'membershipId' in membership ? membership.membershipId : membership?.id);

  const oldSession = await repo.findSessionByTokenHash(oldTokenHash);
  let sessionId = oldSession?.id ? String(oldSession.id) : null;
  if (oldSession?.id) {
    await repo.rotateSessionToken(String(oldSession.id), crypto.createHash('sha256').update(result.refreshToken).digest('hex'));
  } else {
    const createdSession = await svc.createSessionRecord(
      String(oldRecord.tenant_id),
      String(user.id),
      result.refreshToken,
      ip,
      userAgent,
      membershipId,
    );
    sessionId = String(createdSession.id);
  }

  const jwt = svc.getJwtHelper(request.server);
  const accessToken = svc.generateAccessToken(jwt, oldRecord.tenant_id, user.id, membershipId, sessionId);

  await repo.updateSessionActivity(user.id, oldRecord.tenant_id, oldTokenHash);
  await logAudit({ tenantId: oldRecord.tenant_id, userId: user.id, action: 'user.token_refresh', metadata: { membershipId, sessionId } });

  const csrfToken = svc.generateCsrfToken();
  reply.setCookie('refresh_token', result.refreshToken, {
    httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict',
    path: '/', maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  });
  reply.setCookie('csrf_token', svc.hashCsrfToken(csrfToken), {
    httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict',
    path: '/', maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  });

  return sendSuccess(reply, { accessToken, csrfToken, expiresIn: 3600 });
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  // Never fail logout just because the access token expired: resolve the session
  // from the refresh token itself, and always clear the cookies.
  const body = (request.body ?? {}) as Record<string, unknown>;
  const bodyToken = typeof body.refreshToken === 'string' ? body.refreshToken : undefined;
  const token = bodyToken || request.cookies?.refresh_token;
  const ip = request.ip ?? '127.0.0.1';

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await repo.findRefreshTokenByHash(tokenHash);
    if (record) {
      await revokeRefreshToken(token);
      await repo.deactivateSessionByIp(record.user_id, record.tenant_id, ip);
      await logAudit({ tenantId: record.tenant_id, userId: record.user_id, action: 'user.logout' });
    }
  }

  reply.clearCookie('refresh_token', { path: '/' });
  reply.clearCookie('csrf_token', { path: '/' });
  return sendSuccess(reply, { message: 'Logged out successfully' });
}

export async function switchMembership(request: FastifyRequest, reply: FastifyReply) {
  const { userId, sessionId: requestSessionId } = getCtx(request);
  const body = request.body as { membershipId?: unknown };
  const membershipId = typeof body?.membershipId === 'string' ? body.membershipId : '';
  if (!membershipId) throw new UnauthorizedError('Membership is required');

  const membership = await db('memberships')
    .where({ id: membershipId, user_id: userId })
    .first();
  if (!membership || String(membership.status).toUpperCase() !== 'ACTIVE') {
    throw new UnauthorizedError('Membership is not available');
  }

  const user = await repo.findUserById(userId);
  if (!user || String(user.status).toLowerCase() !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const principal = await loadUserPrincipalByMembership(userId, membershipId);
  if (!principal || principal.status.toLowerCase() !== 'active') {
    throw new UnauthorizedError('Membership authorization could not be resolved');
  }

  const jwt = svc.getJwtHelper(request.server);
  const sessionId = requestSessionId || String((request.user as Record<string, unknown> | undefined)?.session_id || '');
  if (sessionId) {
    await repo.updateSessionMembership(sessionId, userId, String(membership.tenant_id), membershipId);
  }
  const accessToken = svc.generateAccessToken(jwt, String(membership.tenant_id), userId, membershipId, sessionId || null);
  await logAudit({
    tenantId: String(membership.tenant_id),
    userId,
    action: 'user.membership_switched',
    metadata: { membershipId, branchId: membership.branch_id, departmentId: membership.department_id },
  });

  return sendSuccess(reply, {
    accessToken,
    expiresIn: 3600,
    user: buildUserResponse(user, principal),
    membership: {
      id: membership.id,
      tenantId: membership.tenant_id,
      branchId: membership.branch_id,
      departmentId: membership.department_id,
      status: membership.status,
    },
  });
}

function normalizeMembershipStatus(value: unknown): 'ACTIVE' | 'SUSPENDED' | 'INVITED' {
  const status = String(value || 'INVITED').toUpperCase();
  if (status !== 'ACTIVE' && status !== 'SUSPENDED' && status !== 'INVITED') {
    throw new ConflictError('Unsupported membership status');
  }
  return status;
}

async function validateMembershipContext(tenantId: string, branchId?: string | null, departmentId?: string | null) {
  if (branchId) {
    const branch = await db('branches').where({ id: branchId, tenant_id: tenantId }).first();
    if (!branch) throw new ConflictError('Branch does not belong to the active tenant');
  }
  if (departmentId) {
    const department = await db('departments').where({ id: departmentId, tenant_id: tenantId }).first();
    if (!department) throw new ConflictError('Department does not belong to the active tenant');
  }
}

export async function listUserMemberships(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = getCtx(request);
  const { userId } = request.params as { userId: string };
  const user = await repo.findUserByIdAndTenant(userId, tenantId);
  if (!user) throw new UnauthorizedError('User is not in the active tenant');
  const memberships = await db('memberships').where({ user_id: userId, tenant_id: tenantId }).orderBy('created_at', 'asc');
  return sendSuccess(reply, memberships);
}

export async function createMembership(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId, userId: actorId } = getCtx(request);
  const { userId } = request.params as { userId: string };
  const body = request.body as Record<string, unknown>;
  const user = await repo.findUserByIdAndTenant(userId, tenantId);
  if (!user) throw new UnauthorizedError('User is not in the active tenant');
  const branchId = typeof body.branchId === 'string' ? body.branchId : null;
  const departmentId = typeof body.departmentId === 'string' ? body.departmentId : null;
  await validateMembershipContext(tenantId, branchId, departmentId);
  const status = normalizeMembershipStatus(body.status);
  const duplicate = await db('memberships').where({ user_id: userId, tenant_id: tenantId }).modify((query) => {
    branchId ? query.andWhere('branch_id', branchId) : query.whereNull('branch_id');
    departmentId ? query.andWhere('department_id', departmentId) : query.whereNull('department_id');
  }).first();
  if (duplicate) throw new ConflictError('Membership already exists');
  const membership = await db.transaction(async (trx) => {
    if (body.isDefault === true) await trx('memberships').where({ user_id: userId, tenant_id: tenantId }).update({ is_default: false });
    const [created] = await trx('memberships').insert({
      user_id: userId, tenant_id: tenantId, branch_id: branchId, department_id: departmentId,
      status, is_default: body.isDefault === true, created_by: actorId,
    }).returning('*');
    return created;
  });
  await invalidateAuthorizationCache(userId, String(membership.id));
  await logAudit({ tenantId, userId: actorId, action: 'membership.created', entityType: 'membership', entityId: String(membership.id), metadata: { targetUserId: userId, status, branchId, departmentId } });
  return sendSuccess(reply, membership, 'Membership created', 201);
}

export async function updateMembership(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId, userId: actorId } = getCtx(request);
  const { membershipId } = request.params as { membershipId: string };
  const body = request.body as Record<string, unknown>;
  const existing = await db('memberships').where({ id: membershipId, tenant_id: tenantId }).first();
  if (!existing) throw new UnauthorizedError('Membership not found');
  const branchId = body.branchId === undefined ? existing.branch_id : (typeof body.branchId === 'string' ? body.branchId : null);
  const departmentId = body.departmentId === undefined ? existing.department_id : (typeof body.departmentId === 'string' ? body.departmentId : null);
  await validateMembershipContext(tenantId, branchId, departmentId);
  const status = body.status === undefined ? existing.status : normalizeMembershipStatus(body.status);
  const update: Record<string, unknown> = {
    branch_id: branchId, department_id: departmentId, status,
    suspended_at: status === 'SUSPENDED' ? new Date() : null,
    updated_at: new Date(),
  };
  await db.transaction(async (trx) => {
    if (body.isDefault === true) await trx('memberships').where({ user_id: existing.user_id, tenant_id: tenantId }).update({ is_default: false });
    if (body.isDefault !== undefined) update.is_default = body.isDefault === true;
    await trx('memberships').where({ id: membershipId, tenant_id: tenantId }).update(update);
  });
  await invalidateAuthorizationCache(String(existing.user_id), membershipId);
  await logAudit({ tenantId, userId: actorId, action: status !== existing.status ? 'membership.status_changed' : 'membership.updated', entityType: 'membership', entityId: membershipId, metadata: { targetUserId: existing.user_id, previousStatus: existing.status, status, branchId, departmentId } });
  return sendSuccess(reply, { ...existing, ...update, id: membershipId }, 'Membership updated');
}

export async function revokeMembership(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId, userId: actorId } = getCtx(request);
  const { membershipId } = request.params as { membershipId: string };
  const existing = await db('memberships').where({ id: membershipId, tenant_id: tenantId }).first();
  if (!existing) throw new UnauthorizedError('Membership not found');
  await db('memberships').where({ id: membershipId, tenant_id: tenantId }).update({ status: 'SUSPENDED', suspended_at: new Date(), updated_at: new Date() });
  await invalidateAuthorizationCache(String(existing.user_id), membershipId);
  await logAudit({ tenantId, userId: actorId, action: 'membership.suspended', entityType: 'membership', entityId: membershipId, metadata: { targetUserId: existing.user_id } });
  return sendSuccess(reply, null, 'Membership suspended');
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const { userId, tenantId } = getCtx(request);
  const user = await repo.findUserByIdAndTenant(userId, tenantId);
  if (!user) throw new UnauthorizedError('User not found');
  const tenant = await repo.findTenantById(tenantId);
  const principal = await loadUserPrincipal(userId, tenantId);
  const memberships = await db('memberships')
    .where({ user_id: userId })
    .whereIn('status', ['ACTIVE', 'INVITED'])
    .select('id', 'tenant_id as tenantId', 'branch_id as branchId', 'department_id as departmentId', 'status', 'is_default')
    .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'asc' }]);
  return sendSuccess(reply, {
    user: buildUserResponse(user, principal),
    memberships,
    activeMembership: principal?.membership || null,
    tenant: tenant ? {
      id: tenant.id, name: tenant.name, slug: tenant.slug,
      locale: tenant.locale, direction: tenant.settings?.direction || (tenant.locale === 'ar' ? 'rtl' : 'ltr'),
      settings: tenant.settings ?? {},
    } : null,
  });
}

export async function listSessions(request: FastifyRequest, reply: FastifyReply) {
  const { userId, tenantId } = getCtx(request);
  const sessions = await repo.findActiveSessions(userId, tenantId);
  return sendSuccess(reply, sessions.map((s: Record<string, unknown>) => ({
    id: s.id, device: s.device, ipAddress: s.ip_address, userAgent: s.user_agent,
    lastActivityAt: s.last_activity_at, createdAt: s.created_at,
  })));
}

export async function revokeSession(request: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = sessionIdSchema.parse(request.params);
  const { userId, tenantId } = getCtx(request);
  await repo.deactivateSession(sessionId, userId, tenantId);
  await logAudit({ tenantId, userId, action: 'user.session_revoked' });
  return sendSuccess(reply, { message: 'Session revoked' });
}

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply) {
  const { email, tenantSlug } = forgotPasswordSchema.parse(request.body);
  const tenant = await repo.findTenantBySlug(tenantSlug);
  if (!tenant) throw new UnauthorizedError('Invalid organization');
  const user = await repo.findUserByEmailAndTenant(email, tenant.id);
  if (!user) return sendSuccess(reply, { message: 'If an account exists, a reset link has been sent.' });

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  await repo.createPasswordReset({ user_id: user.id, tenant_id: tenant.id, token_hash: resetHash, expires_at: new Date(Date.now() + 60 * 60 * 1000) });

  try {
    await sendEmail({ to: user.email, subject: `Password Reset — ${tenant.name}`,
      html: `<p>You requested a password reset.</p><p>Click: <a href="${env.APP_URL}/reset-password?token=${resetToken}">Reset Password</a></p><p>This link expires in 1 hour.</p>` });
  } catch { /* best-effort */ }

  await logAudit({ tenantId: tenant.id, userId: user.id, action: 'user.forgot_password' });
  return sendSuccess(reply, { message: 'If an account exists, a reset link has been sent.' });
}

export async function resetPassword(request: FastifyRequest, reply: FastifyReply) {
  const { token, password } = resetPasswordSchema.parse(request.body);
  const resetHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await repo.findPasswordReset(resetHash);
  if (!reset) throw new UnauthorizedError('Invalid or expired reset token');

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  await repo.updateUser(reset.user_id, { password_hash: passwordHash, password_changed_at: new Date() });
  await repo.deletePasswordReset(reset.id);
  await revokeAllUserTokens(reset.user_id, reset.tenant_id);
  await logAudit({ tenantId: reset.tenant_id, userId: reset.user_id, action: 'user.reset_password' });
  return sendSuccess(reply, { message: 'Password reset successfully. Please log in again.' });
}

export async function changePassword(request: FastifyRequest, reply: FastifyReply) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
  const { userId, tenantId } = getCtx(request);
  const user = await repo.findUserById(userId);
  if (!user) throw new UnauthorizedError('User not found');
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');
  if (await bcrypt.compare(newPassword, user.password_hash)) throw new UnauthorizedError('New password must be different from current password');
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await repo.updateUser(userId, { password_hash: passwordHash, password_changed_at: new Date() });
  await revokeAllUserTokens(userId, tenantId);
  await logAudit({ tenantId, userId, action: 'user.change_password' });
  return sendSuccess(reply, { message: 'Password changed successfully. Please log in again.' });
}

export async function verifyEmail(request: FastifyRequest, reply: FastifyReply) {
  const { token } = verifyEmailSchema.parse(request.body);
  const user = await repo.findUserByVerificationToken(token);
  if (!user) throw new UnauthorizedError('Invalid verification token');
  await repo.updateUser(user.id, { email_verified: true, email_verified_at: new Date(), email_verification_token: null });
  await logAudit({ tenantId: user.tenant_id, userId: user.id, action: 'user.email_verified' });
  return sendSuccess(reply, { message: 'Email verified successfully.' });
}

export async function resendVerification(request: FastifyRequest, reply: FastifyReply) {
  const { email, tenantSlug } = resendVerificationSchema.parse(request.body);
  const tenant = await repo.findTenantBySlug(tenantSlug);
  if (!tenant) throw new UnauthorizedError('Invalid organization');
  const user = await repo.findUserByEmailAndTenant(email, tenant.id);
  if (!user || user.email_verified) return sendSuccess(reply, { message: 'If an account exists, a verification email has been sent.' });
  const verificationToken = svc.generateVerificationToken();
  await repo.updateUser(user.id, { email_verification_token: verificationToken });
  try {
    await sendEmail({ to: user.email, subject: `Verify your email — ${tenant.name}`,
      html: `<p>Please verify your email: <a href="${env.APP_URL}/verify-email?token=${verificationToken}">Verify Email</a></p>` });
  } catch { /* best-effort */ }
  return sendSuccess(reply, { message: 'If an account exists, a verification email has been sent.' });
}

export async function mfaSetup(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = getCtx(request);
  const { secret, otpauthUrl } = generateSecret();
  const qrCode = await generateQrCode(otpauthUrl);
  await repo.updateUser(userId, { mfa_secret: secret });
  return sendSuccess(reply, { secret, qrCode, otpauthUrl });
}

export async function mfaEnable(request: FastifyRequest, reply: FastifyReply) {
  const { code } = mfaEnableSchema.parse(request.body);
  const { userId, tenantId } = getCtx(request);
  const user = await repo.findUserById(userId);
  if (!user || !user.mfa_secret) throw new UnauthorizedError('MFA not set up');
  const valid = verifyToken(code, user.mfa_secret);
  if (!valid) throw new UnauthorizedError('Invalid code. Please try again.');
  await repo.updateUser(userId, { mfa_enabled: true });
  const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
  await repo.storeRecoveryCodes(tenantId, userId, recoveryCodes);
  await logAudit({ tenantId, userId, action: 'user.mfa_enabled' });
  return sendSuccess(reply, { message: 'Two-factor authentication enabled. Store these recovery codes securely.', recoveryCodes });
}

export async function mfaDisable(request: FastifyRequest, reply: FastifyReply) {
  const { code } = mfaDisableSchema.parse(request.body);
  const { userId, tenantId } = getCtx(request);
  const user = await repo.findUserById(userId);
  if (!user || !user.mfa_enabled) throw new UnauthorizedError('MFA is not enabled');
  const valid = verifyToken(code, user.mfa_secret!);
  if (!valid) throw new UnauthorizedError('Invalid code.');
  await repo.updateUser(userId, { mfa_enabled: false, mfa_secret: null });
  await logAudit({ tenantId, userId, action: 'user.mfa_disabled' });
  return sendSuccess(reply, { message: 'Two-factor authentication disabled.' });
}

export async function sendOtp(request: FastifyRequest, reply: FastifyReply) {
  const { identifier, tenantSlug } = otpSendSchema.parse(request.body);
  const tenant = await repo.findTenantBySlug(tenantSlug);
  if (!tenant) throw new UnauthorizedError('Invalid organization');
  const sent = await createAndSendOtp(tenant.id, identifier, 'verify_phone');
  if (!sent) throw new UnauthorizedError('Failed to send OTP');
  return sendSuccess(reply, { message: 'OTP sent successfully.' });
}

export async function verifyOtpHandler(request: FastifyRequest, reply: FastifyReply) {
  const { identifier, code, purpose } = otpVerifySchema.parse(request.body);
  const valid = await verifyOtp(identifier, code, purpose || 'verify_phone');
  if (!valid) { await incrementOtpAttempt(identifier, code, purpose || 'verify_phone'); throw new UnauthorizedError('Invalid or expired OTP code.'); }
  return sendSuccess(reply, { message: 'OTP verified successfully.' });
}

// ── CSRF validation middleware ──
export async function csrfValidation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const url = request.url;
  if (
    url.includes('/auth/login') || url.includes('/auth/refresh') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/forgot-password') || url.includes('/auth/verify-email') ||
    url.includes('/auth/reset-password') || url.includes('/auth/resend-verification') ||
    url.includes('/auth/otp/') ||
    url.includes('/portal/request-access') || url.includes('/portal/otp/request') ||
    url.includes('/portal/verify') ||
    url.includes('/booking/request') ||
    (url.includes('/tenants') && method === 'POST')
  ) return;

  const csrfHeader = request.headers["x-csrf-token"];
  const cookies = request.cookies;
  const csrfCookie = cookies?.csrf_token;
  if (!csrfHeader || !csrfCookie) { reply.code(403).send({ success: false, error: "CSRF token missing" }); return; }

  const expected = crypto.createHash("sha256").update(csrfHeader + env.CSRF_SECRET).digest("hex");
  if (expected !== csrfCookie) { reply.code(403).send({ success: false, error: "CSRF token invalid" }); return; }
}
