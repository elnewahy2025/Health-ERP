# Authorization Scope-Coverage Inventory

**Reviewed:** 2026-08-17  
**Latest reviewed commit:** pending next-scope increment after `8cb6f39`

## Current runtime call sites

The centralized `applyScopePolicy()` registry is now invoked by patient and appointment repositories, EMR and billing handlers, laboratory and radiology order paths, pharmacy inventory/prescription paths, HR employee/attendance/leave paths, compliance lists and patient-consent paths, audit list/detail/filter/export paths, and inventory item/transaction/alert/valuation/purchase-order paths.

## Remaining high-risk coverage targets

| Module | Raw tenant-filtered query signal | Priority | Planned integration surface |
|---|---:|---:|---|
| EMR | 16 | Critical | Patient/encounter list, detail, search, timeline, and export paths. |
| Billing | 14 | Critical | Invoice/payment list, detail, search, aging/aggregate, and export paths. |
| Reports | 9 | Critical | Report data, dashboards, aggregates, and export/download paths. |
| Inventory | 24 | **Expanded** | Item, transaction, alert, valuation, and purchase-order list/detail paths now use warehouse branch context. Stock mutation and receive paths still require a complete write-path ownership matrix. |
| Compliance | 7 | **Expanded** | Policy, audit, consent, and breach list paths now use centralized tenant/patient policies; all update/export variants still require a full matrix. |
| HR | 5 | **Expanded** | Employee, attendance, and leave list/write paths now use new branch/department context; payroll and all sensitive employee detail/export paths remain. |
| Laboratory | 5 | **Expanded** | Lab-order list/status/result paths now invoke patient-linked scope policy. |
| Pharmacy | 5 | **Expanded** | Inventory list/stock and prescription list/create/dispense paths now use branch/patient-linked policies; migration `044` adds inventory branch context. |
| Radiology | 3 | High | Radiology-order list/detail/report paths. |
| Audit | 4 | **Expanded** | Audit list/detail/action-filter/export paths now invoke the centralized tenant policy. |
| Documents | 0 detected | High | Module directory was absent in the current source tree; route registration and storage paths require separate verification. |

## Cross-cutting findings

The remaining modules now pass authenticated principals and effective logical scopes into the policy registry on their principal list/detail paths. Coverage is still not universal: inventory write/receive paths, HR payroll, compliance updates/exports, and other modules/query categories require additional endpoint-by-endpoint proof. Migrations `044_pharmacy_scope_context.ts`, `045_hr_scope_context.ts`, and `046_inventory_scope_context.ts` add nullable branch/department context without mutating legacy rows.

The next implementation pass should introduce a small repository-level helper or module adapter per high-risk module rather than duplicating permission logic in individual handlers. Each adapter must apply tenant isolation first, then branch/department/assigned/self constraints, before count, aggregate, export, or pagination operations are executed.

## Validation target

The implementation will not be considered universally scope-covered until every high-risk module has at least one scoped list/detail path and its export/report/bulk variants either call the same scoped query builder or explicitly prove that they do not return protected data.
