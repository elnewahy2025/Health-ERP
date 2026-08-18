# Centralized Clinic Configuration Design

**Phase:** 3 — implementation checkpoint
**Status:** Partially implemented; the shared registry, additive tables, compatibility facade, module readiness, subscription entitlement fallback, server-side activation guard, system entitlement routes, shell identity/visibility routes, encrypted secret migration 052, and SettingsPage onboarding checklist are committed. Secret rotation/read APIs remain a separate integration slice.
**Product model:** One tenant represents one clinic organisation

## Design goals

The configuration system must allow a tenant administrator to complete clinic setup later without requiring future clinic-specific values to be known during development. It must preserve the current `tenants.settings` JSONB data and `GET/PUT /api/v1/clinic-settings` behavior while moving new configuration into typed, validated, audited, scope-aware storage.

The design must not replace the existing RBAC system, custom tenant roles, branch assignments, department assignments, or module registrations. Configuration controls whether an enabled module is available and correctly configured; it never grants permissions.

## Configuration hierarchy

Effective values are resolved from the most specific applicable scope:

`department override` → `branch override` → `tenant default` → documented safe default.

A missing override does not erase a less-specific value. A value of `null` may only be used for keys whose schema explicitly permits clearing. Every resolved value must retain its source scope for diagnostics and support.

The resolver must validate that a branch or department belongs to the authenticated tenant before reading or writing. Frontend-supplied scope identifiers are requests only; the backend remains authoritative.

## Proposed storage model

The first migration must be additive and idempotent. Exact column types and constraints must be reviewed against the repository’s Knex conventions before implementation.

### `clinic_config_entries`

| Column | Purpose |
|---|---|
| `id` | UUID primary key. |
| `tenant_id` | Owning tenant; always required. |
| `scope_type` | `tenant`, `branch`, or `department`. |
| `scope_id` | Tenant/branch/department identifier; service validates ownership. |
| `key` | Allowlisted configuration key, never an arbitrary unvalidated path. |
| `value_json` | JSONB value validated against the key’s schema. |
| `version` | Optimistic-concurrency version, starting at 1. |
| `effective_from` / `effective_to` | Optional future/effective period for settings that support scheduled changes. |
| `updated_by` | Authenticated actor. |
| `created_at` / `updated_at` | Change timestamps. |

A unique constraint must prevent two active entries for the same tenant, scope, and key. The service must reject a branch/department scope whose resource belongs to another tenant.

### `tenant_module_entitlements`

This table records the system/vendor availability boundary. A tenant administrator cannot activate a module that is not entitled or whose entitlement is expired/suspended. The existing active SaaS subscription plan is also an availability source: its `subscription_plans.modules` list is normalized through the existing singular/plural aliases, while an explicit row in this table overrides the plan. This preserves the current subscription architecture without creating a second plan system.

| Column | Purpose |
|---|---|
| `tenant_id` | Tenant receiving availability. |
| `module_key` | Canonical module key from the shared module registry. |
| `status` | `available`, `suspended`, `expired`, or `revoked`. |
| `source` | System/vendor plan or contract reference. |
| `starts_at` / `expires_at` | Entitlement period. |
| `updated_by` / timestamps | Administrative traceability. |

### `tenant_module_activations`

This table records the tenant administrator’s choice to activate an entitled module. Activation must not grant permissions or change existing roles.

| Column | Purpose |
|---|---|
| `tenant_id` | Owning tenant. |
| `module_key` | Canonical module key. |
| `status` | `enabled`, `disabled`, or `setup_required`. |
| `activated_by` / `activated_at` | Actor and timestamp. |
| `disabled_by` / `disabled_at` | Actor and timestamp. |
| `config_version` | Configuration version used for readiness validation. |
| `last_validation_status` | `valid`, `incomplete`, or `invalid`. |
| `last_validation_errors` | Structured non-secret validation messages. |

### `clinic_integration_secrets`

Integration secrets must not remain in the tenant JSONB response or normal frontend settings state. They require a separate encrypted-at-rest secret mechanism with masked read behavior, rotation, audit, and provider-specific ownership. A secret endpoint must never return the original secret after write.

## Canonical configuration registry

The shared package should define an allowlisted registry for each key:

| Registry field | Meaning |
|---|---|
| `key` | Stable namespaced key, for example `clinic.profile.display_name`. |
| `valueSchema` | Zod or equivalent schema used by backend validation. |
| `allowedScopes` | Tenant, branch, department, or a restricted subset. |
| `requiredFor` | Module(s) or onboarding state that require the key. |
| `secret` | Whether the value belongs in encrypted secret storage. |
| `defaultValue` | Safe default, or explicit “must be configured.” |
| `sensitive` | Whether it requires heightened audit and masking. |
| `description` | Admin-facing explanation and validation guidance. |

Initial key groups should cover clinic identity, contact/address, locale/timezone, branding, operating hours, numbering, currency/tax/payment, services/pricing, notifications, documents/printing, and module setup. Specialty keys must be added only with the corresponding module contract and tests. The canonical optional module registry includes pharmacy, laboratory, radiology, nursing, inventory, insurance, patient portal, online booking, integrations, AI, BI, advanced reporting, and automation.

## Configuration API contract

The current compatibility endpoints remain in place while the new service is introduced.

| Endpoint | Guard | Behavior |
|---|---|---|
| `GET /api/v1/clinic-settings` | `settings.view` | Compatibility response for existing clinic fields; excludes secrets and can include readiness metadata. |
| `PUT /api/v1/clinic-settings` | `settings.manage` | Compatibility update using allowlisted legacy fields, validation, audit, optimistic concurrency, and mapping into the new service. |
| `GET /api/v1/clinic-configuration` | `settings.view` | Effective non-secret configuration for the authorized tenant/scope. |
| `GET /api/v1/clinic-configuration/identity` | Authenticated tenant session | Minimal non-secret shell identity, logo URL, locale, and timezone for shared branding/date formatting. |
| `GET /api/v1/clinic-configuration/readiness` | `settings.view` | Per-module setup status and missing non-secret requirements. |
| `PUT /api/v1/clinic-configuration` | `settings.manage` | Update an allowlisted key at an authorized scope; requires expected version when updating an existing entry. |
| `GET /api/v1/clinic-modules` | `settings.view` | Returns entitlement, activation, readiness, and missing non-secret requirements. |
| `GET /api/v1/clinic-modules/visibility` | Authenticated tenant session | Minimal active/core state for sidebar UX; it never grants permissions. |
| `PUT /api/v1/clinic-modules/:moduleKey` | `settings.manage` | Tenant admin enables/disables only an entitled module; backend checks readiness policy and records audit. |
| `GET /api/v1/system/clinic-module-entitlements` | `saas_billing.manage` at `system` scope | Read effective module boundary for a selected tenant. |
| `PUT /api/v1/system/clinic-module-entitlements/:tenantId/:moduleKey` | `saas_billing.manage` at `system` scope | Manage explicit vendor/system availability; never exposed to ordinary tenant administrators. |

Every mutation must use `logAudit()` with tenant, actor, scope, key/module, old/new non-secret values or hashes, result, and reason where required. Secrets must be represented by metadata such as `configured: true`, not values.

## Safe defaults and incomplete setup

A new tenant may exist in `setup_required` state. The platform must allow the tenant administrator to complete settings without inserting fake clinic information. The application may show a setup checklist and allow access to settings, users, branches, departments, and module configuration.

Operational modules must declare their required configuration. If a required value is missing, the module must show a clear setup-required state and reject only the affected operation with a deterministic configuration error. It must not silently use a dangerous value or break unrelated core modules. The backend authorization middleware now maps covered permission namespaces to canonical clinic modules and rejects optional-module requests unless the tenant is entitled and the module activation is enabled; core modules remain available independently of optional-module state.

## Compatibility and migration rules

1. Do not remove or rename `tenants.settings` in the first migration.
2. Backfill known legacy clinic fields only when the destination key is absent.
3. Preserve non-secret legacy JSONB values until a later deprecation phase has reconciliation evidence.
4. Migration 052 may replace legacy provider-secret values in `tenants.settings` with ciphertext after copying them to `clinic_integration_secrets`; neither the normal configuration response nor frontend state may expose the ciphertext or original value.
5. Do not rewrite custom roles, tenant data, or existing module records.
6. Add migration checks for empty databases, representative existing tenants, duplicate legacy values, and partially configured tenants.
7. Add a feature flag for the new resolver so compatibility behavior can be compared before cutover.
8. Provide a rollback path that disables the new resolver flag without deleting the new tables.

## Implementation slices

The first implementation slice should add only the shared registry, database tables, backend repository/service, and compatibility-safe tests. The second slice should add read-only effective configuration and module-readiness endpoints. The third slice should add tenant-admin mutations and audit. The fourth slice should extend SettingsPage tabs. The resolver cutover for existing consumers is a separate slice after comparison tests pass.

## Phase 3 design gate

This design is ready for implementation only after review confirms the table names, scope rules, module registry keys, secret-storage approach, migration strategy, and compatibility contract. Implementation must stop if any of those decisions are changed without a new design record and impact review.
