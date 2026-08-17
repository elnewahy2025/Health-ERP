# Shared-Grant Role Comparison After Explicit Role Refactor

The previous comparison documented roles collapsing into shared packages. That condition has been removed from the hospital catalog.

| Metric | Current result |
|---|---:|
| Hospital catalog roles | 39 |
| Unique explicit grant signatures | 39 |
| Duplicate-grant groups | 0 |

Each role now has a separately reviewable grant map. Some roles may intentionally share individual permissions (for example, `patients.view`), but no two catalog roles have the same complete effective grant signature. The full page/function/scope details are in `role-operational-matrix.md`.

## Legacy compatibility

Existing `SEED_ROLES` and tenant-owned custom roles are preserved. Migration 047 updates only system role templates in `role_template_catalog`; existing tenant roles are not rewritten.

## Important implementation rule

A role name is not authorization. The effective rights are the persisted explicit grant rows plus any explicit user grants/denials, evaluated by the central authorization engine and then constrained by the module-specific scope policy.
