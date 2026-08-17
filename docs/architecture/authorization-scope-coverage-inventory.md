# Authorization Scope-Coverage Inventory

**Reviewed:** 2026-08-17  
**Baseline commit:** `3a98e7a`

## Current runtime call sites

The centralized `applyScopePolicy()` registry is currently invoked by the patient repository for list, quick-search, and trigram-search paths, and by the appointment repository for list, daily-summary, and bulk-cancellation paths. These are the first production integrations of the new module-specific policy layer.

## Remaining high-risk coverage targets

| Module | Raw tenant-filtered query signal | Priority | Planned integration surface |
|---|---:|---:|---|
| EMR | 16 | Critical | Patient/encounter list, detail, search, timeline, and export paths. |
| Billing | 14 | Critical | Invoice/payment list, detail, search, aging/aggregate, and export paths. |
| Reports | 9 | Critical | Report data, dashboards, aggregates, and export/download paths. |
| Inventory | 24 | High | Stock, item, movement, purchase, and bulk-adjustment paths. |
| Compliance | 7 | High | Policy, audit, consent, and breach list/detail/export paths. |
| HR | 5 | High | Employee list/detail/search and sensitive export paths. |
| Laboratory | 5 | High | Lab-order list/detail/search and result access paths. |
| Pharmacy | 5 | High | Prescription list/detail/dispense and inventory mutation paths. |
| Radiology | 3 | High | Radiology-order list/detail/report paths. |
| Audit | 4 | Critical | Audit list/detail/action filters and export paths. |
| Documents | 0 detected | High | Module directory was absent in the current source tree; route registration and storage paths require separate verification. |

## Cross-cutting findings

The current modules generally enforce `tenant_id` directly, but most do not pass the authenticated principal and effective logical scope into `applyScopePolicy()`. Consequently, branch, department, assigned-patient, and self scopes are not uniformly applied to list, detail, search, aggregate, export, dashboard, and bulk-action paths.

The next implementation pass should introduce a small repository-level helper or module adapter per high-risk module rather than duplicating permission logic in individual handlers. Each adapter must apply tenant isolation first, then branch/department/assigned/self constraints, before count, aggregate, export, or pagination operations are executed.

## Validation target

The implementation will not be considered universally scope-covered until every high-risk module has at least one scoped list/detail path and its export/report/bulk variants either call the same scoped query builder or explicitly prove that they do not return protected data.
