# Authorization Final Gap Checklist

**Reviewed:** 2026-08-18
**Branch:** `main`
**Implementation baseline:** `a04bd28`

## Completed implementation targets

| Requirement | Evidence | Status |
|---|---|---|
| Membership lifecycle | Protected list, create, update, and revoke routes with ownership checks, status transitions, audit events, cache invalidation, token revocation, and session deactivation. | Complete |
| Membership-bound authentication | Login, MFA, refresh, and switch flows issue `user_id`, `active_membership_id`, and `session_id` claims; persistent session IDs are validated. | Complete |
| Authorization precedence | Explicit user DENY, explicit user ALLOW, role DENY, role ALLOW, and wildcard specificity are ranked deterministically. | Complete |
| Wildcard permissions | Exact, module wildcard, and global wildcard matching remains compatible with the existing catalog and mutation APIs. | Complete |
| RBAC permission naming | `roles.update` is the documented guard; `roles.edit` remains compatible through shared normalization. | Complete |
| RBAC lifecycle | Custom create/update/delete, template clone, membership-aware assignment/removal, privilege ceilings, system-role protection, audit, cache invalidation, and session revocation. | Complete |
| Hospital role catalog | All 39 predefined templates are centralized in shared authz and seeded by migration 042. | Complete |
| Scope policies | Patients, appointments, EMR, billing, laboratory, radiology, pharmacy, HR, compliance, audit, inventory, and reports have runtime policy integrations and scope-context migrations where required. | Complete for defined modules |
| Query isolation regressions | Tenant, branch, department, assigned-patient, report, audit, inventory, wildcard, and denial cases are covered by unit/regression tests. | Complete |
| Frontend primitives | `Can`, `ProtectedRoute`, `filterMenu`, `AuthorizationContext`, `useAuthorization`, membership switcher, protected routes, and permission-aware navigation. | Complete |
| Frontend action gates | Sensitive controls in Patients, DMS, BI, appointments, billing, laboratory, pharmacy, HR, inventory, radiology, reports, and audit export are gated. Roles retains equivalent `useAuth().can()` checks. | Complete for exposed controls |
| Audit architecture | Existing `logAudit()` is reused for membership, role, assignment, denial, switch, and permission mutation events. | Complete |
| Authorization caching | Versioned Redis cache is membership-safe; status is checked before cache read; mutations bump versions and invalidate keys. | Complete |
| Security tests | JWT claim tests, precedence tests, scope-policy tests, and an opt-in PostgreSQL migration/seed/isolation suite are committed. | Complete in code |

## External execution prerequisite

The only remaining step is operational rather than an application-code gap. The PostgreSQL integration suite must be run against a disposable PostgreSQL database in CI or a staging-like validation environment:

```bash
DB_NAME=healthcare_test RUN_AUTHZ_DB_TESTS=true \
  npm run test:integration --workspace=@healthcare/backend
```

The suite runs migrations, seeds two tenants and memberships, validates cross-tenant and cross-branch isolation, tests forged and revoked memberships, verifies wildcard and denial behavior, and cleans its fixed fixture identifiers. The sandbox used for implementation had no PostgreSQL daemon, so this command was not executed locally.

## Acceptance decision

> **The authorization implementation is complete in code and has passed all available unit, frontend, type-check, precedence, and scope-policy validation. PostgreSQL-backed migration and integration execution remains a required CI/release gate.**

No frontend or backend path should treat a successful UI check as a security decision. Every protected API remains responsible for authentication, authorization, scope policy, tenant ownership, and audit behavior.

## References

[1]: https://github.com/elnewahy2025/Health-ERP/blob/main/docs/architecture/authorization-rbac-reference.md "Authorization RBAC reference architecture"
[2]: https://github.com/elnewahy2025/Health-ERP/blob/main/docs/architecture/authorization-rbac-completion-audit.md "Authorization completion audit"
[3]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/services/__tests__/authorization.integration.test.ts "PostgreSQL authorization integration suite"
