# Clinic Configuration Dependency Map

**Assessment date:** 2026-08-18
**Purpose:** Phase 2 baseline for safe centralized clinic configuration work
**Code changes in this phase:** None

## Verified baseline

| Area | Current implementation | Evidence | Safe conclusion |
|---|---|---|---|
| Tenant identity | `tenants` has `id`, `name`, `slug`, `domain`, `locale`, `timezone`, `settings`, `status`, timestamps. | `packages/backend/migrations/001_initial_schema.ts` | Tenant identity and settings already have a database home. |
| Clinic settings storage | Clinic values are stored inside `tenants.settings` JSONB. | `packages/backend/src/modules/clinic-settings/index.ts` | Existing data must be preserved and migrated, not discarded. |
| Settings read | `GET /api/v1/clinic-settings` requires `settings.view`. | Clinic settings module | Existing route can become a compatibility facade over a typed configuration service. |
| Settings write | `PUT /api/v1/clinic-settings` requires `settings.manage`; body is shallow-merged into JSONB. | Clinic settings module | Must add schema validation, allowlisted keys, audit, concurrency/version handling, and secret separation before expanding it. |
| Settings response | Current response includes Twilio credential fields from tenant JSONB. | Clinic settings module lines 10–37 | Credentials must not be returned to ordinary frontend state. This is a Phase 3 security blocker. |
| Settings frontend | `SettingsPage` edits clinic name, branch, phones, logo URL, address, city, country, map URL, email, website, working hours, license, and tax number. | `packages/frontend/src/pages/SettingsPage.tsx` | Preserve the page as a compatibility starting point; expand it in controlled tabs. |
| Settings navigation | Existing Settings page links to user preferences, notification templates, regions, print templates, security, and clinic information. | `SettingsPage` and navigation metadata | Existing destinations should remain available while centralized configuration is introduced. |
| Branches | `branches` belongs to a tenant and stores name, code, address JSONB, phone, email, status, timezone, timestamps. | `packages/backend/migrations/001_initial_schema.ts` | Branch settings should be a child scope with tenant ownership and explicit override rules. |
| Departments | `departments` belongs to a tenant and stores name, code, active state, timestamps. | `packages/backend/migrations/033_authorization_rbac.ts` | Department configuration should remain compatible with existing CRUD and scope policies. |
| Staff assignment | Users have department/branch context and `user_branches` provides many-to-many branch assignments. | RBAC migration and users module | Configuration must not replace authorization membership or branch assignments. |
| Authorization | `settings.view` and `settings.manage` already exist; backend guards are mandatory. | Shared permission catalog and clinic-settings module | Settings writes must remain backend-authorized; UI gates are secondary. |
| Module catalog | The shared permission catalog and frontend route/sidebar maps enumerate modules, but no tenant module-entitlement/activation table was found in the inspected sources. | Shared authz, `App.tsx`, router, sidebar, backend registration | Module availability and tenant activation are not yet a centralized persisted capability. |
| Module registration | Backend modules are registered in `packages/backend/src/index.ts`; frontend pages are lazy-loaded and route-mapped. | Backend index and frontend App/router | Future module activation must gate routes and backend operations without deleting module registrations. |
| Custom roles | Existing tenant custom roles are separate from predefined hospital role templates. | RBAC implementation and migrations | Configuration work must not rewrite custom role grants. |
| Audit | Existing `logAudit()` is the audit mechanism. | Backend audit service and module usage | Configuration changes must use `logAudit()` rather than introducing a second audit system. |

## Current missing configuration capabilities

The repository does not yet provide a verified centralized configuration model for tenant module availability, tenant module activation, branch/department overrides, configuration versions, effective dates, configuration validation status, onboarding readiness, or safe module-disable behavior. These are implementation targets for Phase 3, not claims that the current application already supports them.

The current `tenants.settings` JSONB is not sufficient by itself for all future configuration because it has no typed key registry, scope column, version/optimistic-lock field, effective-date model, per-key audit linkage, secret separation, or module readiness contract. It may remain as a compatibility source during migration, but new configuration should not be added through uncontrolled arbitrary JSON merges.

## Required configuration domains

The following domains are the planned target of the centralized configuration service. Each must be mapped to an allowlisted schema and an owning scope before implementation:

| Domain | Initial scope | Examples |
|---|---|---|
| Organisation profile | Tenant | Legal/display name, logo, contacts, address, license identifiers, default locale, timezone. |
| Branch profile | Branch | Address, phones, email, timezone, operating hours, rooms, local numbering. |
| Department profile | Department | Name, code, active state, specialty label, operating hours, responsible manager. |
| Module availability | System/vendor entitlement | Which modules a tenant is allowed to activate. |
| Module activation | Tenant, optionally branch | Which available modules are enabled for the clinic organisation or branch. |
| Scheduling | Tenant/branch/department | Slot duration, working hours, appointment types, cancellation rules, provider calendars. |
| Services and pricing | Tenant/branch | Service catalog, price lists, taxes, payment methods, payer settings. |
| Clinical dictionaries | Tenant/module | Configured forms, terminology mappings, lab/radiology catalogs, medication settings. |
| Notifications | Tenant/branch/module | Sender identities, templates, channels, opt-in behavior, provider configuration. |
| Documents and printing | Tenant/branch | Templates, branding, paper formats, numbering, signatures. |
| Integration endpoints | Tenant/module | External identifiers, endpoint metadata, credential references, retry policy, status. |
| Onboarding/readiness | Tenant/module | Required fields, validation errors, configured-by, last-validated, readiness status. |

## Compatibility rules for Phase 3

The future implementation must retain `GET /api/v1/clinic-settings` and `PUT /api/v1/clinic-settings` as compatibility endpoints or provide an explicitly versioned replacement with a migration adapter. Existing clinic information must be read and preserved during backfill.

No tenant settings value may be moved or deleted without a migration report that shows the source key, destination key, number of affected tenants, null/default behavior, and rollback or recovery procedure. No module may be disabled solely because its new configuration is incomplete; the system must expose a controlled setup-required state and reject only operations that genuinely require missing configuration.

## Phase 2 safety checkpoint

A repository safety tag `pre-clinic-config-baseline-20260818` was created at the clean pre-configuration commit before any implementation change. Phase 3 must create a new commit for each coherent additive slice and run the affected tests before proceeding to the next slice.
