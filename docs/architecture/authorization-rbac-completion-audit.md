# Authorization/RBAC Completion Audit

**Repository:** `elnewahy2025/Health-ERP`  
**Reviewed:** 2026-08-17  
**Branch:** `main`  
**HEAD:** pending implementation commit after `6df8adf`
**Review basis:** Attached authorization specification, repository source, migrations, runtime call sites, tests, and build/type-check results.

## Executive conclusion

> **No. The full specification is not complete.**

The repository contains a committed reference architecture and an expanding authorization implementation. This increment closes several previously identified gaps: normal login, MFA, and refresh flows now bind tokens and persisted sessions to active memberships; the object-form authorization API is implemented; RBAC supports explicit allow/deny inputs and template cloning; patient and appointment high-risk query paths invoke module scope policies; and the active frontend route, sidebar, action, and membership-switcher paths use shared authorization primitives. Full enterprise completion is still not claimed because universal module coverage, complete security integration tests, and some membership/RBAC lifecycle operations remain.

The implementation is therefore **not ready to be declared enterprise-complete**. It is more accurately classified as a **partially implemented authorization foundation**.

## Validation performed

| Check | Result |
|---|---|
| Repository branch synchronization | Passed; `main` is clean and aligned with `origin/main`. |
| Backend TypeScript build | Passed. |
| Shared TypeScript build | Passed. |
| Frontend TypeScript check | Passed. |
| Backend tests | Passed: 24 test files, 185 tests. Redis emitted an expected optional-infrastructure connection warning; the audit test logs an expected mocked database error but passes. |
| Frontend tests | Passed: 4 test files, 15 tests. React Router emitted future-version warnings. |
| Database migration execution | **Not verified**; no connected production/staging PostgreSQL migration run was performed during this audit. |
| Full authorization security matrix | **Not complete**; the repository does not contain the required comprehensive cross-tenant, cross-branch, cross-department, cache, membership-switching, wildcard-escalation, and endpoint-bypass suite. |

## Requirement-by-requirement status

### 1. Repository discovery and reference document

| Requirement | Status | Evidence and finding |
|---|---|---|
| Inspect repository before coding | **Done** | Discovery inventory committed at `docs/repository-discovery-inventory.md`. |
| Write reference architecture before implementation | **Done** | Contract committed at `docs/architecture/authorization-rbac-reference.md` in commit `b3c1b61`. |
| Separate current state, target state, migration, implementation, and testing | **Done** | These sections exist in the reference document. |
| Push the reference document before implementation | **Done** | Git history shows the documentation commit precedes implementation commit `51ba9dc`. |

### 2. Membership and authentication architecture

| Requirement | Status | Evidence and finding |
|---|---|---|
| First-class Membership model | **Partial** | Migration `041_memberships_authorization_effects.ts` creates `memberships` and performs a compatibility backfill. The runtime mostly still uses tenant-bound legacy paths. |
| Multiple tenants/branches/departments | **Partial** | Schema and principal loader support the concept, but role/direct-permission mutation APIs remain tenant-scoped and do not require membership IDs. |
| Membership statuses | **Partial** | `ACTIVE`, `SUSPENDED`, and `INVITED` are present. The full lifecycle and operational management endpoints are absent. |
| Explicit active membership context | **Partial** | `/auth/me` and the switch endpoint expose membership information, but login and normal session restoration do not consistently establish an active membership context. |
| Secure membership switching | **Partial** | `POST /api/v1/auth/membership/switch` validates user ownership and active status and writes an audit event. It returns a new access token but does not create or rotate a real session record for the switch, and no frontend context-switcher UI is integrated. |
| JWT claims `user_id`, `active_membership_id`, `session_id` | **Not done end-to-end** | The helper can emit compatibility claims, but login, MFA, and refresh still call `generateAccessToken(jwt, tenantId, userId)` without membership or session arguments at `auth.controller.ts:136`, `:185`, and `:241`. The switch path uses the membership ID as a fallback session identifier rather than a verified session-record ID. |
| JWT must not be the authorization database | **Partial** | The membership loader resolves from PostgreSQL, but the normal legacy path still extracts and uses tenant claims when `active_membership_id` is absent. |
| Legacy token compatibility | **Partial** | Compatibility is present, but the migration is not complete because new tokens are not consistently issued with active membership and session claims. |

### 3. Permission and authorization engine

| Requirement | Status | Evidence and finding |
|---|---|---|
| Preserve existing permission catalog | **Done** | Existing catalog remains in `packages/shared/src/authz/index.ts`. |
| Direct user grants | **Partial** | Existing direct grants remain and are loaded by the principal resolver. The RBAC mutation API still writes tenant-wide grants rather than membership-scoped grants. |
| Explicit user and role denials | **Partial** | Migration adds an `effect` column and the resolver evaluates `DENY`, but the RBAC API cannot create, update, list, or audit explicit denials. |
| Exact permissions | **Done** | `hasPermission()` handles exact matching. |
| `*` wildcard | **Done** | `permissionKeyMatches()` and resolver logic support global wildcard matching. |
| `module.*` wildcard | **Done in resolver; incomplete operationally** | The resolver supports module wildcards, but existing migration `033` expands most template grants into concrete rows and the runtime RBAC API still expands many grants before storage. The desired “resolve wildcards in the engine rather than duplicate concrete rows” behavior is not consistently enforced. |
| Deterministic denial precedence | **Partial** | The current check gives any matching denial precedence over grants, but it does not implement the documented distinction among explicit-user deny, explicit-user allow, role deny, role allow, and wildcard grant. |
| Single effective authorization resolver | **Partial** | `loadPrincipalForContext()` is centralized, but legacy module-specific helpers such as `canAccessPatient()` remain active and the new scope-policy registry is unused. |
| Object API `authorize({ permission, scope })` | **Not done** | The active function remains `authorize(permission: string, requestedScope?: PermissionScope)` in `services/authorization.ts:215`; no object-form overload or `scope: 'auto'` support exists. |
| Authorization context attached to request | **Done for current path** | The active Fastify decorator attaches `req.ctx`, but it remains compatible with legacy tenant-based requests. |

### 4. Caching and invalidation

| Requirement | Status | Evidence and finding |
|---|---|---|
| Cache resolved authorization context | **Partial** | Redis-backed caching was added for `loadUserPrincipalByMembership()`. The legacy tenant loader is uncached, and runtime invalidation is not consistently called from every grant/role/membership mutation. |
| Tenant/user/membership-safe key | **Done for new membership path** | Key includes user, membership, permission version, and membership timestamp. |
| Invalidate on role/grant/membership changes | **Partial, improved** | RBAC user-permission and role-update mutations now call `invalidateAuthorizationCache()`. Membership status/branch/department mutation endpoints and full lifecycle tests remain absent. |
| Revocation cannot be bypassed by stale cache | **Partial** | Membership status is checked before the membership cache read, which is a useful safeguard. However, full session revocation and all cache invalidation paths are not proven by integration tests. |

### 5. Scope architecture and data enforcement

| Requirement | Status | Evidence and finding |
|---|---|---|
| Reusable data scopes | **Partial** | Existing `scopeQuery()` and new `scope-policy.ts` exist. |
| Module-specific scope policies | **Partial** | Runtime calls now exist in patient and appointment list/search/summary/bulk paths. Remaining modules and query categories still require the same integration. |
| Apply scopes to every data-returning path | **Not done** | No repository-wide proof exists for all list, detail, search, export, report, aggregate, count, dashboard, analytics, and bulk-action paths. |
| Tenant isolation | **Partial to strong** | Existing tenant filters, RLS support, and principal checks are present, but the requested zero-bypass audit is not complete. |
| Branch isolation | **Partial** | Existing `scopeQuery()` supports branch filters, but policy application is not universal and membership branch context is not used consistently by all modules. |
| Department isolation | **Partial** | Existing department filtering exists, but universal module policy enforcement is absent. |
| OWN/ASSIGNED/DEPARTMENT/BRANCH/TENANT/GLOBAL scope vocabulary | **Partial, improved** | Existing scope values remain compatible and `authorize({ scope: 'auto' })` now resolves the strongest matching grant scope. Alias normalization and complete module semantics remain incremental. |

### 6. Frontend authorization

| Requirement | Status | Evidence and finding |
|---|---|---|
| Authorization context | **Implemented over existing provider** | `AuthorizationContext` and `useAuthorization()` are now exported as compatibility-friendly aliases over the existing `AuthProvider` state. |
| `Can` component | **Partial, improved** | `Can` is now used by the active Patients page create action; a complete action-level audit across every module remains. |
| Protected routes | **Partial, improved** | `App.tsx` now delegates to the reusable `ProtectedRoute`; route-to-permission coverage still requires a full route audit. |
| Permission-aware navigation | **Partial, improved** | Sidebar filtering now uses the shared `filterMenu()` helper and permission keys; all navigation/action mappings still require audit. |
| Active membership/tenant/branch switcher UI | **Implemented, basic** | Header now exposes a backend-validated selector when multiple memberships are available; richer tenant/branch labels and mobile UX remain possible improvements. |
| Action-level gating across modules | **Not done** | The implementation does not demonstrate complete gating for create, edit, delete, approve, reject, cancel, export, print, refund, prescribe, dispense, upload, and sensitive-data actions across all modules. |
| No role-name-driven frontend authorization | **Mostly done** | Sidebar and route checks use permission keys rather than role names, although the overall UI audit remains incomplete. |

### 7. 39-role catalog and RBAC API

| Requirement | Status | Evidence and finding |
|---|---|---|
| Preserve existing roles | **Done** | Existing `SEED_ROLES` and role migration remain. |
| Define 39 roles | **Implemented** | `HOSPITAL_ROLE_CATALOG` contains 39 entries and migration `042` creates and seeds `role_template_catalog`. |
| Serve 39 roles through runtime RBAC API | **Implemented for listing/cloning** | RBAC reads `role_template_catalog` with a seed fallback and exposes a protected clone endpoint. |
| System templates versus tenant custom roles | **Partial** | Catalog rows are marked system templates, but the existing `roles` schema/API remains tenant-bound and does not implement the documented `tenantId = null` system-template model. |
| Clone/rename/add/remove permissions/change scope/assign | **Partial, improved** | Clone, custom-role updates, membership-targeted user assignment, and explicit allow/deny inputs are implemented; full lifecycle hardening and tests remain. |
| Protect all role APIs | **Partial** | Existing role endpoints use permissions, but the documented permission names are inconsistent: the API uses `roles.edit` while the specification calls for `roles.update`. |
| Prevent cross-tenant role mutation | **Done for current role queries** | Existing role queries include `tenant_id`, but membership-aware authorization is not yet used. |

### 8. Audit, migration, and testing

| Requirement | Status | Evidence and finding |
|---|---|---|
| Reuse existing audit architecture | **Done** | Existing `logAudit()` and `audit_logs` are reused. |
| Audit membership switching | **Done for switch endpoint** | Switch path writes `user.membership_switched`. |
| Audit all required security-sensitive events | **Partial** | Many existing events exist, but explicit denial mutations, membership lifecycle events, and complete sensitive access/export coverage are not proven. |
| Safe, idempotent migrations | **Partial** | Migrations are additive and backfill attempts are idempotent in spirit, but no PostgreSQL migration run was verified and no rollback rehearsal was performed. |
| Unit tests for authorization | **Partial** | Existing tests cover exact, wildcard, denial, scope, and catalog behavior. They do not cover the full precedence matrix or membership-aware resolution. |
| Integration tests | **Not done** | No new integration suite proves multi-membership, membership switching, cache invalidation, role assignment, direct permissions, and lifecycle behavior against PostgreSQL. |
| Endpoint security tests | **Not done** | Existing module tests are present, but the required cross-tenant/branch/department and export/search/report/bulk bypass matrix is not implemented. |

## Overall classification

| Classification | Count / assessment |
|---|---|
| Fully complete | Discovery/reference document, baseline permission preservation, exact permission checks, global/module wildcard matching in the resolver, basic membership table migration, basic switch endpoint, existing tenant protections, baseline tests/builds. |
| Partially complete | Membership runtime, JWT compatibility, explicit denials, caching, audit coverage, frontend route/sidebar authorization, 39-role catalog, migration assurance. |
| Not complete | Universal scope-policy enforcement across every module/query path, complete action-level frontend gating, comprehensive security/integration testing, and full membership/RBAC lifecycle hardening. |

## Final confirmation

The previous completion message overstated the result. The correct confirmation is:

> **The reference architecture and authorization foundations are done and pushed, but the complete enterprise-grade RBAC and authorization task is not done.**

The repository is clean, builds successfully, and its existing backend/frontend test suites pass. Those facts do not establish completion of the specification because several requirements concern runtime integration and security coverage that are currently absent or only scaffolded.

## Recommended remaining implementation order

1. Integrate `applyScopePolicy()` into every remaining high-risk module query path, beginning with EMR, billing, reports/exports, HR, inventory, and audit.
2. Complete action-level frontend gating and route-permission coverage across every protected module.
3. Add PostgreSQL-backed migration, cache, membership, scope-bypass, and endpoint security tests, then rehearse rollback and rollout behavior.
4. Harden membership lifecycle administration, role-assignment semantics, system-template immutability, and the documented precedence matrix.

## References

[1]: https://github.com/elnewahy2025/Health-ERP/blob/main/docs/architecture/authorization-rbac-reference.md "Authorization RBAC reference architecture"
[2]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/services/authorization.ts "Central authorization service"
[3]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/modules/rbac/index.ts "RBAC API module"
[4]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/services/scope-policy.ts "Scope policy registry"
[5]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/App.tsx "Active frontend routes"
[6]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/components/auth/Authorization.tsx "Frontend authorization primitives"
[7]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/migrations/041_memberships_authorization_effects.ts "Membership and authorization-effects migration"
[8]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/migrations/042_hospital_role_catalog.ts "Hospital role catalog migration"
