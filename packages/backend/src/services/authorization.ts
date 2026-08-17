import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import { ForbiddenError } from '@healthcare/shared/errors';
import { expandGrantKey, normalizeLegacyPermission, permissionKeyMatches } from '@healthcare/shared/authz';
import type { Grant, PermissionEffect, PermissionScope } from '@healthcare/shared/authz';
import { db } from '../core/database.js';
import { CACHE_TTL, getOrSet } from '../core/redis.js';
import { redis } from '../core/redis.js';

/**
 * Centralized authorization service — the only place permission/scope decisions
 * are made (see docs/engineering/AUTHORIZATION.md).
 *
 * A principal is the authenticated identity (staff user today; patient
 * principals join via the portal in a later phase). Effective grants are the
 * union of role grants (role_permissions) and direct grants (user_permissions).
 */

export interface MembershipContext {
  id: string;
  userId: string;
  tenantId: string;
  branchId: string | null;
  departmentId: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | string;
}

export interface Principal {
  kind: 'user';
  id: string;
  tenantId: string;
  membershipId?: string;
  membership?: MembershipContext;
  roles: string[];
  grants: Grant[];
  denials?: Grant[];
  branches: string[];
  departmentId: string | null;
  locale: 'ar' | 'en';
  permVersion: number;
  status: string;
}

export interface RequestCtx {
  tenantId: string;
  userId: string;
  membershipId?: string;
  authorizationScope?: PermissionScope;
  roles: string[];
  permissions: string[];
  branches: string[];
  locale: 'ar' | 'en';
  branchId?: string;
  requestId: string;
  principal: Principal;
}

const SCOPE_RANK: Record<PermissionScope, number> = {
  self: 0,
  assigned_patients: 1,
  department: 2,
  branch: 3,
  branches: 4,
  tenant: 5,
  system: 6,
};

/** True when a grant at `grantScope` covers a request at `requestedScope`. */
export function scopeCovers(grantScope: PermissionScope, requestedScope: PermissionScope): boolean {
  return SCOPE_RANK[grantScope] >= SCOPE_RANK[requestedScope];
}

export function uniquePermissionKeys(grants: Grant[]): string[] {
  const concrete = grants.flatMap((grant) => expandGrantKey(grant.permission));
  return Array.from(new Set(concrete.length > 0 ? concrete : grants.map((g) => g.permission))).sort();
}

/**
 * Load a staff user principal with effective grants from the normalized tables.
 * Returns null when the user does not exist in the tenant.
 */
async function loadPrincipalForContext(
  userId: string,
  tenantId: string,
  membership?: MembershipContext,
): Promise<Principal | null> {
  const user = await db('users').where({ id: userId, tenant_id: tenantId }).first();
  if (!user) return null;

  const roleQuery = db('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .andWhere('user_roles.tenant_id', tenantId);
  if (membership?.id) roleQuery.andWhere('user_roles.membership_id', membership.id);
  const roleRows = await roleQuery.select('roles.slug');

  const roleGrantQuery = db('role_permissions')
    .join('user_roles', 'role_permissions.role_id', 'user_roles.role_id')
    .where('user_roles.user_id', userId)
    .andWhere('user_roles.tenant_id', tenantId);
  if (membership?.id) roleGrantQuery.andWhere('user_roles.membership_id', membership.id);
  const roleGrantRows = await roleGrantQuery.select('role_permissions.permission', 'role_permissions.scope', 'role_permissions.effect');

  const directGrantQuery = db('user_permissions').where({ user_id: userId, tenant_id: tenantId });
  if (membership?.id) directGrantQuery.andWhere('membership_id', membership.id);
  const directGrantRows = await directGrantQuery.select('permission', 'scope', 'effect');

  const branchQuery = db('user_branches').where({ user_id: userId, tenant_id: tenantId });
  if (membership?.id) branchQuery.andWhere('membership_id', membership.id);
  const branchRows = await branchQuery.select('branch_id');

  const mapGrant = (row: { permission: unknown; scope: unknown; effect?: unknown }, source: 'role' | 'user'): Grant => ({
    permission: String(row.permission),
    scope: String(row.scope) as PermissionScope,
    effect: (String(row.effect || 'ALLOW').toUpperCase() as PermissionEffect),
    source,
  });
  const grants = [
    ...roleGrantRows.map((row) => mapGrant(row, 'role')),
    ...directGrantRows.map((row) => mapGrant(row, 'user')),
  ];
  const denials = grants.filter((grant) => grant.effect === 'DENY');

  return {
    kind: 'user',
    id: userId,
    tenantId,
    membershipId: membership?.id,
    membership,
    roles: roleRows.map((r) => String(r.slug)),
    grants: grants.filter((grant) => grant.effect !== 'DENY'),
    denials,
    branches: branchRows.map((b) => String(b.branch_id)),
    departmentId: membership?.departmentId || (user.department_id ? String(user.department_id) : null),
    locale: user.locale === 'ar' ? 'ar' : 'en',
    permVersion: Number(user.perm_version || 0),
    status: String(user.status || 'active'),
  };
}

export async function getDefaultMembershipForUser(userId: string, tenantId: string): Promise<MembershipContext | null> {
  const row = await db('memberships')
    .where({ user_id: userId, tenant_id: tenantId, status: 'ACTIVE' })
    .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'asc' }])
    .first();
  if (!row) return null;
  return {
    id: String(row.id),
    userId,
    tenantId,
    branchId: row.branch_id ? String(row.branch_id) : null,
    departmentId: row.department_id ? String(row.department_id) : null,
    status: String(row.status),
  };
}

export async function loadUserPrincipal(userId: string, tenantId: string): Promise<Principal | null> {
  return loadPrincipalForContext(userId, tenantId);
}

export async function loadUserPrincipalByMembership(userId: string, membershipId: string): Promise<Principal | null> {
  const membership = await db('memberships').where({ id: membershipId, user_id: userId }).first();
  if (!membership) return null;
  const context: MembershipContext = {
    id: String(membership.id),
    userId,
    tenantId: String(membership.tenant_id),
    branchId: membership.branch_id ? String(membership.branch_id) : null,
    departmentId: membership.department_id ? String(membership.department_id) : null,
    status: String(membership.status),
  };
  if (context.status.toUpperCase() !== 'ACTIVE') return null;
  const user = await db('users').where({ id: userId, tenant_id: context.tenantId }).select('perm_version', 'status').first();
  if (!user || String(user.status).toLowerCase() !== 'active') return null;
  const version = Number(user.perm_version || 0);
  const contextVersion = new Date(membership.updated_at || membership.created_at || 0).getTime();
  const key = `authz:${userId}:${membershipId}:${version}:${contextVersion}`;
  try {
    return await getOrSet(key, () => loadPrincipalForContext(userId, context.tenantId, context), CACHE_TTL.MEDIUM);
  } catch {
    return loadPrincipalForContext(userId, context.tenantId, context);
  }
}

export async function invalidateAuthorizationCache(userId: string, membershipId?: string): Promise<void> {
  // Version bumps are the primary invalidation mechanism. This best-effort
  // deletion removes currently known keys when Redis supports SCAN.
  try {
    let cursor = '0';
    const pattern = membershipId ? `authz:${userId}:${membershipId}:*` : `authz:${userId}:*`;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {
    // Redis is optional; versioned database resolution remains authoritative.
  }
}

/**
 * Core permission check. A wildcard '*' grant (super_admin) passes everything.
 * When `requestedScope` is provided, the grant's scope must cover it.
 */
function permissionSpecificity(storedKey: string, requestedKey: string): number {
  if (storedKey === requestedKey) return 3;
  if (storedKey.endsWith('.*') && requestedKey.startsWith(`${storedKey.slice(0, -2)}.`)) return 2;
  if (storedKey === '*') return 1;
  return 0;
}

function authorizationRank(grant: Grant): number {
  const isUser = grant.source === 'user';
  if (isUser && grant.effect === 'DENY') return 400;
  if (isUser) return 300;
  if (grant.effect === 'DENY') return 200;
  return 100;
}

export function hasPermission(
  principal: Principal,
  permission: string,
  requestedScope?: PermissionScope,
): boolean {
  const requested = requestedScope as PermissionScope | undefined;
  const canonicalPermission = normalizeLegacyPermission(permission);
  const candidates = [...(principal.grants || []), ...(principal.denials || [])]
    .filter((grant) => permissionKeyMatches(grant.permission, canonicalPermission))
    .filter((grant) => !requested || scopeCovers(grant.scope, requested))
    .sort((left, right) => {
      const rankDifference = authorizationRank(right) - authorizationRank(left);
      if (rankDifference !== 0) return rankDifference;
      return permissionSpecificity(right.permission, canonicalPermission) - permissionSpecificity(left.permission, canonicalPermission);
    });
  return candidates[0]?.effect !== 'DENY' && candidates.length > 0;
}

export function anyPermission(
  principal: Principal,
  permissions: string[],
  requestedScope?: PermissionScope,
): boolean {
  return permissions.some((p) => hasPermission(principal, p, requestedScope));
}

/**
 * Fastify preHandler guard — enforces permission + scope before a handler runs.
 * Usage: preHandler: [authenticate, authorize('patients.view', 'branch')]
 */
export interface AuthorizeOptions {
  permission: string;
  scope?: PermissionScope | 'auto';
}

function matchingGrantScopes(principal: Principal, permission: string): PermissionScope[] {
  const canonicalPermission = normalizeLegacyPermission(permission);
  return principal.grants
    .filter((grant) => permissionKeyMatches(grant.permission, canonicalPermission))
    .map((grant) => grant.scope)
    .sort((left, right) => SCOPE_RANK[right] - SCOPE_RANK[left]);
}

export function authorize(permission: string, requestedScope?: PermissionScope): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export function authorize(options: AuthorizeOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export function authorize(
  permissionOrOptions: string | AuthorizeOptions,
  positionalScope?: PermissionScope,
) {
  const options: AuthorizeOptions = typeof permissionOrOptions === 'string'
    ? { permission: permissionOrOptions, scope: positionalScope }
    : permissionOrOptions;
  const requestedScope = options.scope === 'auto' ? undefined : options.scope;

  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const req = request as FastifyRequest & { ctx?: { principal?: Principal; authorizationScope?: PermissionScope } };
    const principal = req.ctx?.principal;
    if (!principal) throw new ForbiddenError('Authorization context missing');
    if (!hasPermission(principal, options.permission, requestedScope)) {
      throw new ForbiddenError(
        `Missing permission: ${options.permission}${requestedScope ? ` (scope: ${requestedScope})` : ''}`,
      );
    }
    if (req.ctx) {
      req.ctx.authorizationScope = requestedScope || matchingGrantScopes(principal, options.permission)[0];
    }
  };
}

/**
 * Apply tenant isolation + scope filters to a query builder.
 * The tenant filter is always applied; scope filters narrow by the principal's
 * own assignments (branches/department). Callers must still run authorize()
 * — this never widens access.
 */
export function scopeQuery<T extends Knex.QueryBuilder>(
  qb: T,
  principal: Principal,
  opts: {
    tenantColumn?: string;
    branchColumn?: string;
    departmentColumn?: string;
    scope?: PermissionScope;
  } = {},
): T {
  const tenantColumn = opts.tenantColumn || 'tenant_id';
  qb = qb.andWhere(tenantColumn, principal.tenantId) as T;
  if (!opts.scope || opts.scope === 'tenant' || opts.scope === 'system') return qb;
  if ((opts.scope === 'branch' || opts.scope === 'branches') && opts.branchColumn) {
    if (principal.branches.length > 0) {
      qb = qb.whereIn(opts.branchColumn, principal.branches) as T;
    } else {
      qb = qb.where(false) as T; // no assigned branches → no rows
    }
  } else if (opts.scope === 'department' && opts.departmentColumn) {
    if (principal.departmentId) {
      qb = qb.andWhere(opts.departmentColumn, principal.departmentId) as T;
    } else {
      qb = qb.where(false) as T;
    }
  }
  return qb;
}

/** Patient ids assigned to this principal (doctor/nurse via appointments/orders). */
export async function assignedPatientIds(principal: Principal): Promise<string[]> {
  const rows = await db('appointments')
    .where({ tenant_id: principal.tenantId, doctor_id: principal.id })
    .whereNotNull('patient_id')
    .distinct('patient_id');
  return rows.map((r) => String(r.patient_id));
}

/**
 * Pure scope check for a single patient record (no DB access). Returns true
 * when the principal's `patients.view` grant scope covers this patient's
 * branch/assignment relationship. Used by canAccessPatient and unit tests.
 */
export function patientAccessByScope(
  principal: Principal,
  patient: { id: string; tenant_id: string; branch_id?: string | null; department_id?: string | null },
): boolean {
  if (principal.tenantId !== patient.tenant_id) return false;

  // Exact-scope inspection: each grant scope expresses a different access
  // dimension for patient data (tenant-wide, branch-wide, or assigned
  // patients). The assigned_patients signal is intentionally narrow — a
  // broader grant (branch/tenant) must pass its own dedicated check below,
  // never the assignment check.
  const scopes = new Set(
    principal.grants
      .filter((g) => g.permission === '*' || g.permission === 'patients.view')
      .map((g) => g.scope),
  );
  if (scopes.has('system') || scopes.has('tenant')) return true;
  if (
    (scopes.has('branch') || scopes.has('branches')) &&
    patient.branch_id &&
    principal.branches.includes(String(patient.branch_id))
  ) {
    return true;
  }
  if (scopes.has('assigned_patients')) {
    return true; // assignment membership is resolved by the caller via assignedPatientIds
  }
  return false;
}

/**
 * True when the principal holds an active, unexpired break-glass
 * emergency-access grant for this patient (docs/engineering/AUTHORIZATION.md §8).
 * Every activation/revocation is audited with the emergency flag.
 */
export async function hasEmergencyAccess(principal: Principal, patientId: string): Promise<boolean> {
  const row = await db('emergency_access')
    .where({
      tenant_id: principal.tenantId,
      user_id: principal.id,
      patient_id: patientId,
      status: 'active',
    })
    .where('expires_at', '>', new Date())
    .first();
  return Boolean(row);
}

/**
 * True when a principal may access a specific patient record.
 * Tenant mismatch always denies; scope is checked against the patient's
 * branch/department/assignment relationships. An active, audited
 * emergency-access grant is a controlled last-resort override.
 */
export async function canAccessPatient(
  principal: Principal,
  patient: { id: string; tenant_id: string; branch_id?: string | null; department_id?: string | null },
): Promise<boolean> {
  if (principal.tenantId !== patient.tenant_id) return false;
  // An assigned_patients grant is narrow: it only covers patients assigned to
  // this principal. patientAccessByScope deliberately returns true for the
  // assigned_patients scope, so membership must be enforced here — unless a
  // broader grant (branch/tenant/system) independently covers this patient.
  if (hasPermission(principal, 'patients.view', 'assigned_patients')) {
    const broader =
      hasPermission(principal, 'patients.view', 'branch') ||
      hasPermission(principal, 'patients.view', 'branches') ||
      hasPermission(principal, 'patients.view', 'tenant') ||
      hasPermission(principal, 'patients.view', 'system');
    if (!broader && !(await assignedPatientIds(principal)).includes(patient.id)) {
      return false;
    }
  }
  if (patientAccessByScope(principal, patient)) return true;
  if (await hasEmergencyAccess(principal, patient.id)) return true;
  return false;
}
