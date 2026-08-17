# Hospital ERP Authorization and RBAC Reference Architecture

**Status:** Implementation contract v1.0  
**Repository:** `elnewahy2025/Health-ERP`  
**Author:** Manus AI  
**Date:** 2026-08-17  

> This document is the contract for incrementally enhancing authorization in the existing Hospital ERP. It deliberately extends the current Fastify, Knex/PostgreSQL, React, and shared TypeScript architecture. It does not authorize a rewrite of working systems.

## 1. Scope and governing principles

The target flow is:

```text
JWT(user_id + active_membership_id + session_id)
  -> authentication
  -> active membership (tenant + branch + department + status)
  -> role grants + direct user grants + explicit denials
  -> effective authorization (resolved and cached)
  -> authorize({ permission, scope })
  -> module-specific scope policy
  -> constrained query
  -> PostgreSQL/RLS
```

Authorization is a security boundary, not a presentation feature. The backend remains authoritative; frontend checks are usability and navigation controls only. A request-supplied tenant, branch, department, user, role, membership, or resource identifier is never trusted until it is validated against the authenticated principal and the database.

The implementation must preserve existing permission keys, existing custom tenant roles, legacy JSON role/permission fields during migration, existing refresh-token rotation, PostgreSQL tenant context/RLS, and current API behavior wherever the stronger model can be introduced compatibly.

## 2. Current architecture analysis — CURRENT STATE

The repository is a TypeScript monorepo with `packages/backend`, `packages/frontend`, and `packages/shared`. The backend uses Fastify 5, Knex 3, PostgreSQL, `@fastify/jwt`, Redis/ioredis infrastructure, and Vitest. The frontend uses React 18, React Router 6, TanStack Query, and a local auth store. Database changes are numbered Knex migrations; the latest authorization migration is `033_authorization_rbac.ts`.

The current normalized authorization layer already includes `roles`, `role_permissions`, `user_roles`, `user_permissions`, `user_branches`, `departments`, `users.department_id`, `users.perm_version`, and role `level`/`scope_default`. The migration backfills roles and direct permissions from legacy JSON fields and converts the legacy single `branch_id` into `user_branches`. This is a valuable compatibility bridge and must not be discarded.

The current `Principal` is tenant-bound and contains `id`, `tenantId`, roles, grants, branch identifiers, one department identifier, locale, permission version, and user status. `loadUserPrincipal(userId, tenantId)` resolves roles, role grants, direct grants, and branch assignments from PostgreSQL. The current `hasPermission` handles exact keys and the global `*` grant, but does not evaluate `module.*` at request time and has no explicit deny representation. `scopeQuery` provides reusable tenant, branch, and department filters, while patient access adds assignment and emergency-access logic.

The active bootstrap in `packages/backend/src/index.ts` verifies JWTs, extracts `tenantId` and `userId`, reloads the principal server-side, rejects inactive users, and attaches `request.ctx`. The active access-token generator currently emits `{ tenantId, userId }`; the older `packages/backend/src/plugins/auth.ts` assumes a different claim shape and must be treated as legacy unless runtime registration proves otherwise. Login, refresh, logout, sessions, MFA, and `/auth/me` are implemented in `modules/auth` and use refresh-token rotation and audit logging.

The frontend `authStore` restores `/auth/me`, exposes `can` and `canAny`, and checks flat effective permission keys. `App.tsx` has a permission-aware `ProtectedRoute`; `Sidebar.tsx` annotates navigation entries with permission keys and filters them. Scope is not interpreted in the frontend. These patterns should be extended through a shared authorization context, `Can`, `ProtectedRoute`, and `filterMenu`, not replaced with a second state-management system.

The application has more than 30 registered backend modules and a shared catalog with approximately 100 modules/actions and over 120 concrete permission keys. The existing shared catalog defines seven scopes (`self`, `assigned_patients`, `department`, `branch`, `branches`, `tenant`, `system`) and twelve current seed role templates (`super_admin`, `admin`, `doctor`, `nurse`, `receptionist`, `pharmacist`, `lab_tech`, `radiologist`, `billing_staff`, `accountant`, `manager`, `patient`). The precise current inventory is recorded in [`repository-discovery-inventory.md`](../repository-discovery-inventory.md).

## 3. Existing authorization inventory

| Area | Current implementation | Contract decision |
|---|---|---|
| Authentication | Fastify JWT, access/refresh tokens, MFA, sessions | Preserve security controls; add membership/session claims compatibly |
| Tenant context | JWT `tenantId`, user row `tenant_id`, `withTenant`, RLS | Replace authoritative tenant resolution with active membership lookup |
| Roles | `roles`, `user_roles`, `role_permissions`, legacy JSON roles | Preserve; add system-template distinction and membership-aware assignments |
| Direct grants | `user_permissions` with permission and scope | Preserve; add grant effect and optional resource constraints |
| Denials | No explicit normalized deny effect found | Add `ALLOW`/`DENY` with deterministic precedence |
| Wildcards | Catalog expansion at seed/migration time and `*` request check | Preserve `*`; add deterministic `module.*` runtime matching |
| Scopes | `self`, `assigned_patients`, `department`, `branch`, `branches`, `tenant`, `system` | Preserve names for compatibility; define module policies and aliases |
| Cache | Redis exists; principal currently reloads from DB | Add versioned authorization-context cache only after correctness tests |
| Audit | Existing `audit_logs` and `logAudit` service | Extend the existing system; do not create a duplicate logger |
| Frontend | Flat permissions in auth store, route guard, sidebar filtering | Add context/hook/components while retaining API compatibility |

## 4. Gaps identified

The current model has one tenant assignment per user in the principal path, no first-class membership entity, and JWT tenant claims that are treated as request context. Branches are normalized, but departments are primarily attached to the user rather than the membership. User role uniqueness is not explicitly membership-scoped. Direct permissions have no effect column, so explicit denials cannot override grants. Runtime wildcard matching is incomplete for `module.*`. The authorize API is positional rather than the requested object form, and there is no common module scope-policy registry.

The current code also contains many endpoint-level tenant filters and some module-specific access logic. This is a strength for backward compatibility but a risk for uniformity: list, search, export, report, aggregate, bulk, and direct-resource paths must be audited for equivalent scope constraints. The document therefore mandates incremental policy adoption and security tests before removing any legacy path.

## 5. Target architecture — TARGET STATE

### 5.1 Membership model

Add a first-class `memberships` table with `id`, `user_id`, `tenant_id`, nullable `branch_id`, nullable `department_id`, `status`, timestamps, and audit metadata as required by existing conventions. Membership status initially consists of `ACTIVE`, `SUSPENDED`, and `INVITED`; `REVOKED` is added only if the existing lifecycle requires irreversible revocation, and the reason must be recorded in the migration notes. A user may have many memberships across tenants, branches, and departments.

Roles, direct grants, denials, and branch/department context used for an authorization decision must be resolved through the selected membership. Existing tenant-wide records are migrated to one active membership per existing tenant context, preserving the existing primary branch and user department. A later membership may be created for every additional branch assignment.

### 5.2 JWT and session design

New access tokens contain `user_id`, `active_membership_id`, and `session_id`, along with `iat` and `exp`. The token is a reference to authenticated session state, not an authorization database. `tenant_id`, `branch_id`, `department_id`, roles, permissions, and scopes are not authoritative JWT claims. During a compatibility window, the verifier accepts legacy `{tenantId, userId}` tokens, resolves or creates the corresponding membership, and marks the request as legacy-authenticated for observability. New tokens are issued in the new form on login, MFA completion, refresh, and membership switch.

Session records must retain the active membership or an equivalent session context. Membership switching verifies that the membership belongs to the authenticated user and is `ACTIVE`, records an audit event, and issues a new access/session context. It must not accept a tenant or membership from an untrusted query string or payload without ownership validation.

### 5.3 Effective authorization

Create one resolver, `getEffectiveAuthorization(principal)`, backed by the existing authorization service. It returns a normalized context containing user, membership, tenant, branch, department, membership status, roles, grants, denials, resolved scopes, permission version, and cache metadata. Modules must not independently combine roles, direct permissions, or denials.

Permission matching checks exact permission, `module.*`, and `*`, without materializing every wildcard into storage. Matching is deterministic and returns the strongest applicable decision for the requested permission and scope. Explicit user denial takes precedence over explicit user allow, role denial, role allow, and wildcard grants. If the repository reveals an established contrary rule, the reference document must be amended before code changes and the compatibility impact recorded.

The initial precedence contract is:

| Precedence | Decision |
|---:|---|
| 1 | Explicit user `DENY` |
| 2 | Explicit user `ALLOW` |
| 3 | Role `DENY` |
| 4 | Role `ALLOW` |
| 5 | Wildcard grants |
| 6 | No matching decision |

A grant must also cover the requested scope. The existing rank ordering is retained for compatibility: `self < assigned_patients < department < branch < branches < tenant < system`. A narrower grant cannot satisfy a broader request.

### 5.4 Middleware API

Preserve the positional API while adding the object API:

```ts
authorize('patients.view', 'branch')
authorize({ permission: 'patients.view', scope: 'auto' })
```

The guard authenticates the request, resolves the active membership from PostgreSQL, checks status, resolves effective authorization, evaluates exact and wildcard grants plus denials, chooses the scope, attaches the normalized context, and then invokes the module. Frontend authorization never substitutes for this guard.

### 5.5 Module-specific scope policies

Implement a registry of policies rather than a universal SQL predicate. Each policy maps a logical scope to real columns and joins in the module’s schema. The common invariant is always tenant isolation; branch, department, ownership, assignment, and global constraints are module-specific.

| Logical scope | Required interpretation |
|---|---|
| `OWN`/`self` | Resource owner or authenticated subject, using the module’s real owner field |
| `ASSIGNED`/`assigned_patients` | Assignment relation, such as doctor/patient assignment or appointment ownership |
| `DEPARTMENT`/`department` | Active membership department, with no access if absent |
| `BRANCH`/`branch` | Active membership branch |
| `BRANCHES`/`branches` | All branch IDs explicitly assigned to the user within the active tenant |
| `TENANT`/`tenant` | Active tenant only |
| `GLOBAL`/`system` | System-level access, never a client-supplied bypass |

Policies are required for patients, appointments, EMR, nursing, laboratory, radiology, pharmacy, billing, finance/financial reports, HR, inventory, procurement/purchase orders, reports, audit, documents, communication, and emergency access. Each policy must cover list, detail, search, export, print, aggregate, count, dashboard, report, and bulk operations where the module exposes them.

### 5.6 Cache and invalidation

Use Redis if it is available and configured; otherwise use the existing database path without adding infrastructure. The cache key is `authz:{userId}:{membershipId}:{authorizationVersion}`. The version must change when role grants, role assignments, direct grants, denials, membership status/context, or role scopes change. Cache reads must still verify membership status and session validity so revocation cannot be masked by stale authorization. Cache payloads must be tenant- and membership-bound and must never be shared across principals.

### 5.7 Audit

Extend `audit_logs` and `logAudit` for login, logout, membership switching, role assignment/removal, permission grant/deny, role modification, membership activation/suspension, sensitive-record access, export, delete, approval, refund/payment, and emergency-access activation/use/revocation. Include actor, membership, tenant, branch where known, target resource, result, request ID, and reason metadata without logging secrets or raw tokens.

## 6. Frontend authorization — TARGET STATE

Add `AuthorizationContext`, `useAuthorization()`, `Can`, `ProtectedRoute`, and `filterMenu()` in the existing React architecture. The context loads the backend-resolved authorization context and preserves `can(permission)` and `canAny()` compatibility. `Can` supports exact permissions and `anyOf` where useful. Routes are guarded by permissions, not role names. Navigation entries declare permissions and are filtered centrally. Action-level gates cover create, edit, delete, approve, reject, cancel, export, print, refund, prescribe, dispense, upload, and sensitive-data access.

The frontend must expose an active membership/tenant/branch context switcher only for memberships returned by the backend. A hidden button or route is not a security control; all operations remain backend-authorized.

## 7. Role catalog — TARGET STATE

The existing twelve roles remain compatible. Add system role templates for the following 39-role catalog, without collapsing distinct hospital job functions into shared grant packages. System templates have `systemRole=true` and `tenantId=null`; tenant custom roles have `systemRole=false` and the active tenant ID. Tenant administrators may clone and customize templates but may not mutate global templates.

Each of the 39 catalog roles must have an explicit, independently reviewable grant map. Roles may share individual permission keys where the job function genuinely overlaps, but no two distinct catalog roles may be identical across their complete `(permission, scope)` set. The catalog default scope is descriptive only; every sensitive grant must carry the correct module-specific scope. A role’s description, slug, or default-scope label is not evidence of access unless its explicit grants enforce it.

| # | Role template | Default scope | Primary access |
|---:|---|---|---|
| 1 | Super Administrator | GLOBAL | Platform-wide operations |
| 2 | Tenant Administrator | TENANT | Organization administration |
| 3 | Hospital Executive | TENANT | Clinical and operational oversight |
| 4 | Hospital Operations Manager | TENANT | Operations, reports, workflows |
| 5 | Branch Manager | BRANCH | Branch operations |
| 6 | Department Head | DEPARTMENT | Department operations |
| 7 | Medical Director | TENANT | Clinical governance |
| 8 | Physician | ASSIGNED | Assigned patients and clinical work |
| 9 | Consultant Physician | ASSIGNED | Advanced assigned clinical work |
| 10 | Resident Physician | ASSIGNED | Supervised clinical work |
| 11 | Nurse Manager | DEPARTMENT | Nursing leadership |
| 12 | Registered Nurse | DEPARTMENT | Nursing care |
| 13 | Nurse Assistant | ASSIGNED | Assigned care tasks |
| 14 | Pharmacist | BRANCH | Pharmacy operations |
| 15 | Pharmacy Technician | BRANCH | Pharmacy support |
| 16 | Laboratory Manager | DEPARTMENT | Laboratory management |
| 17 | Laboratory Technician | DEPARTMENT | Laboratory execution |
| 18 | Radiology Manager | DEPARTMENT | Radiology management |
| 19 | Radiologist | DEPARTMENT | Radiology interpretation |
| 20 | Radiology Technician | DEPARTMENT | Radiology execution |
| 21 | Medical Records Officer | DEPARTMENT | Records and documents |
| 22 | Medical Coder | DEPARTMENT | Coding and claims support |
| 23 | Receptionist | BRANCH | Registration and scheduling |
| 24 | Appointment Coordinator | BRANCH | Appointment operations |
| 25 | Triage Officer | BRANCH | Queue and triage |
| 26 | Billing Manager | BRANCH | Billing supervision |
| 27 | Billing Officer | BRANCH | Billing operations |
| 28 | Accountant | TENANT | Finance and financial reports |
| 29 | Insurance Manager | TENANT | Insurance operations |
| 30 | Insurance Claims Officer | BRANCH | Claims processing |
| 31 | HR Manager | TENANT | Human resources |
| 32 | HR Officer | DEPARTMENT | HR operations |
| 33 | Inventory Manager | BRANCH | Inventory and procurement |
| 34 | Procurement Officer | BRANCH | Purchasing and suppliers |
| 35 | Compliance Officer | TENANT | Compliance and audit |
| 36 | Reporting and BI Analyst | TENANT | Reports and analytics |
| 37 | IT/System Administrator | TENANT | System settings and integrations |
| 38 | Patient Portal Administrator | TENANT | Portal and self-service administration |
| 39 | Patient Portal User | OWN | Patient self-service |

Permissions must be selected from the existing catalog. Any role needing an absent operation must first document the gap and add a catalog permission only if the module exposes and tests that operation. Every role record must include name, description, default scope, grants, denials if applicable, module access, and expected navigation access.

## 8. Migration strategy — MIGRATION

Migration must be additive and idempotent wherever practical. First create memberships from existing tenant assignments, preserving each user’s current tenant context, primary branch, department, roles, direct grants, and status. Then add membership-aware foreign keys or assignment columns alongside legacy columns. Backfill new role assignments to the corresponding active membership. Do not delete legacy JSON fields or existing normalized tables until a later, separately approved cleanup migration.

The migration sequence is: create memberships and indexes; add status/effect/system-role metadata; backfill memberships; attach or migrate role/direct-grant assignments; add authorization-version tracking; introduce compatible JWT/session fields; add switch and `/auth/me` response fields; migrate request context; enable policy enforcement module by module; then remove only dead compatibility code after telemetry and rollback validation.

Rollback must be forward-safe: down migrations must not destructively remove production data. If a new column or table cannot be safely rolled back, document a compensating rollback procedure rather than dropping records. Every backfill must be rerunnable using unique keys and conflict-safe inserts.

## 9. File-level implementation plan — IMPLEMENTATION

| Increment | Files/areas | Deliverable |
|---:|---|---|
| 1 | `packages/shared/src/authz/index.ts` | Add effect types, wildcard matcher contract, catalog validation, 39 templates, compatibility aliases |
| 2 | New Knex migration after `040` | Memberships, denial/effect metadata, membership-aware assignment constraints, indexes, idempotent backfill |
| 3 | `packages/backend/src/services/authorization.ts` | Unified resolver, deterministic precedence, object authorize API, versioned cache, normalized context |
| 4 | `packages/backend/src/index.ts`, auth module/service/repository | New JWT/session claims, legacy-token bridge, membership validation and switching |
| 5 | `packages/backend/src/modules/rbac/index.ts` | Membership-scoped role/grant/deny APIs, template cloning, invalidation and audit |
| 6 | Backend module policies | Central registry plus module-specific scope constraints for high-risk modules first |
| 7 | `packages/frontend/src/stores/authStore.tsx`, new authz components/hooks | Context, `Can`, `ProtectedRoute`, active membership switching, compatibility helpers |
| 8 | `Sidebar.tsx`, `App.tsx`, route/config files | Permission-driven navigation, route protection, action gates |
| 9 | Tests and audit | Unit, integration, endpoint, migration, cache, and security regression suites |

Implementation must proceed in small commits. Before any contract conflict is resolved in code, update this document with a dated decision note and the compatibility impact.

## 10. API changes

Add `POST /api/v1/auth/membership/switch` accepting `{ membershipId }`, with ownership and active-status checks. Add a backend-resolved membership list and active membership to `/auth/me` and login responses. Extend RBAC endpoints with membership-aware role assignment and explicit grant/deny operations while preserving existing role CRUD routes. Preserve existing positional `authorize()` calls during migration and add object-form calls incrementally.

Role endpoints must enforce `roles.view`, `roles.create`, `roles.update`, `roles.delete`, and `roles.assign`, and every mutation must verify the target role belongs to the active tenant or is a cloneable system template. No tenant administrator may edit another tenant’s role or a global system role.

## 11. Security and testing strategy — TESTING

Unit tests must cover exact permission, `module.*`, `*`, explicit deny, direct allow, role allow/deny, precedence, scope coverage, missing department/branch, membership status, and legacy-token normalization. Integration tests must cover multiple tenants, branches, departments, active-membership switching, role assignment, direct grants, denials, cache invalidation, session revocation, and migration idempotency.

Endpoint tests must cover patients, appointments, EMR, laboratory, radiology, pharmacy, billing, HR, inventory/procurement, reports, exports, dashboards, aggregates, bulk actions, audit, roles, and membership APIs. Security tests must attempt cross-tenant, cross-branch, cross-department, user/role/permission/membership/resource ID manipulation, JWT tampering, wildcard escalation, direct URL access, hidden endpoint access, export/search/report bypass, cache poisoning, stale cache, and revoked-membership access.

Acceptance requires that no unauthorized endpoint succeeds when the client changes `tenantId`, `branchId`, `departmentId`, `userId`, `roleId`, `membershipId`, or resource IDs. Every tenant-data query path applies tenant isolation and its module scope policy. Revoked or suspended membership is denied even with a warm cache. Existing login, refresh, logout, MFA, patient portal, custom roles, and legacy permission behavior remain functional through the compatibility window.

## 12. Rollout and risk assessment

Roll out in shadow mode for resolver comparisons, then enforce membership resolution for new tokens, then enable high-risk policies for patient, EMR, billing, exports, reports, and RBAC, and finally migrate remaining modules. Emit structured deny and legacy-token metrics without exposing sensitive data. Keep a feature flag for each policy family and a documented emergency rollback that restores the previous resolver while preserving audit visibility.

The main risks are an incorrect legacy backfill, hidden reliance on tenant JWT claims, inconsistent module schemas, overbroad wildcards, stale authorization caches, and frontend assumptions about flat permission arrays. Mitigations are idempotent migrations, dual-read compatibility, schema-specific policies, deny precedence tests, versioned cache invalidation, and preserving `can()`/`canAny()` adapters.

## 13. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-17 | Extend the existing Knex/Fastify/shared authorization architecture rather than introduce a new framework | Repository already has normalized RBAC, RLS, guards, audit, and tests |
| 2026-08-17 | Retain existing permission keys and scope names | Prevents destructive authorization behavior changes and protects existing modules |
| 2026-08-18 | Replace shared 39-role base inheritance with explicit role grant maps | Distinct hospital job functions must produce distinct effective rights; existing `SEED_ROLES` remain as legacy compatibility templates while the 39 system catalog becomes authoritative for new role clones |
| 2026-08-17 | Treat the active bootstrap as authoritative over the legacy auth plugin | `src/index.ts` is the registered application composition root; the plugin has a conflicting claim model |
| 2026-08-17 | Add memberships additively and preserve legacy tenant fields during migration | Existing users and sessions must not be broken by a schema cutover |

## 14. Definition of done

The work is complete only when this document exists in the repository, the membership/JWT/authorization/cache/scope/frontend/audit changes are implemented incrementally, all current tests and new security tests pass, migration/backfill validation is demonstrated, the 39-role catalog is seeded without deleting current roles, and the final branch contains a clear commit history describing the compatibility and rollout decisions.
