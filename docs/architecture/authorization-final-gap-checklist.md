# Authorization Final-Gap Checklist

**Reviewed:** 2026-08-18
**Branch:** `main`
**Baseline:** `5db99dd`

## Confirmed current coverage

The repository has membership-bound login/MFA/refresh/switch token claims, persistent session validation, object-form authorization compatibility, explicit allow/deny mutation support, Redis-backed authorization caching, a 39-role catalog read/clone path, reusable frontend authorization primitives, active membership switching UI, and runtime scope-policy calls in patients, appointments, EMR, billing, laboratory, radiology, pharmacy, HR, compliance, audit, and inventory paths.

## Remaining implementation targets

| Requirement | Current gap | Completion target |
|---|---|---|
| Universal backend scope enforcement | Remaining write/receive, payroll, report/export/aggregate/dashboard, finance/procurement, and other module paths are not all policy-wrapped. | Every tenant-data list, detail, search, export, report, aggregate, count, dashboard, analytics, and bulk path either invokes a module policy or is documented as tenant-only with a test. |
| Inventory writes | Stock updates, transfers, bulk receipt, dispensing, and purchase-order receive are not all checked through a policy-constrained resource lookup. | Add policy-aware resource authorization before each mutation and protect both source/destination warehouses. |
| HR payroll | Payroll list and nested payroll-entry access are tenant-only. | Join payroll entries to employees and apply HR department/branch policy. |
| Reports and exports | Report ownership is improved, but the complete report/aggregate/export matrix is not covered. | Centralize report data constraints and add endpoint tests for export, search, aggregate, and scheduled execution ownership. |
| Membership lifecycle | No complete protected create/update/suspend/activate/revoke administration API with cache invalidation and audit coverage. | Add lifecycle service/routes with actor authorization, ownership checks, status transitions, cache invalidation, and audit events. |
| RBAC API semantics | Role API still has permission-key inconsistencies such as `roles.edit` versus `roles.update`; delete/remove/assign lifecycle and system-template protections need full coverage. | Normalize documented API permissions with compatibility aliases and add protected clone/update/delete/assign/remove routes plus tests. |
| Denial precedence | Resolver has denial support, but the full explicit-user/role/wildcard precedence matrix is not fully encoded and tested. | Implement deterministic ranking and test direct allow/deny, role allow/deny, exact, module wildcard, and global wildcard combinations. |
| Audit completeness | Switching and many mutations are audited, but lifecycle, explicit denial, sensitive access, export, delete, approval, and financial coverage is not proven uniformly. | Add a single auditable security-event helper and endpoint-level assertions for required events. |
| Frontend action coverage | `Can` is integrated in selected Patients, DMS, and BI controls only. | Audit all protected pages and gate create/edit/delete/approve/reject/cancel/export/print/refund/prescribe/dispense/upload/download/sensitive-view actions. |
| Database-backed validation | Type checks and unit tests pass; PostgreSQL migration execution and cross-tenant/branch/department integration tests are not present. | Provide a disposable PostgreSQL test configuration, run migrations, seed two tenants/memberships, and test isolation, switching, revocation, cache invalidation, exports, reports, and bulk actions. |

## Acceptance rule

The task must not be reported as complete until every row above has executable evidence or an explicit external blocker is documented. Passing TypeScript and existing unit suites alone is insufficient.
