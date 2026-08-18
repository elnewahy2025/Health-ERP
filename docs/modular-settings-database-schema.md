# Modular Clinic Settings and Provider Configuration Schema

**Project:** Health-ERP Clinic Management System  
**Database:** PostgreSQL through Knex migrations  
**Status:** Design proposal; not yet implemented

## 1. Design objectives

The database must support one tenant representing one clinic organisation, with optional branches and departments, while keeping generic clinic configuration separate from country-specific compliance and payment-provider configuration.

The design preserves the current configuration hierarchy:

> **Department override → branch override → tenant setting → documented safe default**

It also preserves the existing distinction between vendor/system availability and tenant activation:

> **Entitlement controls whether a tenant may use a module; activation controls whether the tenant has enabled it; RBAC controls which staff members may operate it.**

Provider credentials must be encrypted at the application layer, never returned to ordinary API clients, and never stored inside general JSON configuration.

## 2. Existing tables to preserve

The repository already has the following relevant tables:

| Existing table | Current responsibility | Recommendation |
|---|---|---|
| `clinic_config_entries` | Tenant, branch, and department configuration values with versioning | Preserve as the generic scoped settings store. |
| `tenant_module_entitlements` | System/vendor availability boundary for a tenant and module | Preserve; add catalog foreign-key support only after catalog migration. |
| `tenant_module_activations` | Tenant activation status and readiness snapshot | Preserve and extend with validation timestamps and configuration version. |
| `clinic_integration_secrets` | Encrypted tenant/provider secret key-value pairs | Preserve for compatibility; add connection and rotation metadata. |
| `audit_logs` | Tenant-scoped audit history | Preserve; add optional module/provider/scope metadata for better filtering. |

The existing `clinic_config_entries` polymorphic `scope_type`/`scope_id` design should not be replaced in the first migration because the service already validates branch and department ownership. The database should add check constraints for allowed scope types, while the service remains responsible for verifying that a branch or department belongs to the same tenant.

## 3. Proposed entity model

```text
system_module_catalog
        │
        ├── tenant_module_entitlements ── tenant_module_activations
        │                                      │
        │                                      └── tenant_module_configurations
        │
        └── tenant_provider_connections ── clinic_integration_secrets
                                                └── secret_versions (optional later)

 tenants ── tenant_regional_profiles
    │
    ├── clinic_config_entries
    ├── tenant_module_entitlements
    ├── tenant_module_activations
    ├── tenant_module_configurations
    ├── tenant_provider_connections
    └── audit_logs
```

## 4. Global module catalog

The current TypeScript module catalog is the safe compile-time baseline. A database catalog should be introduced only if system/vendor administrators need to change module availability or configuration schemas without deploying code.

```sql
CREATE TABLE system_module_catalog (
  module_key              varchar(80) PRIMARY KEY,
  category                varchar(30) NOT NULL,
  provider_key            varchar(80),
  display_name_key        varchar(160) NOT NULL,
  description_key         varchar(160),
  jurisdiction_code       varchar(16),
  availability_status     varchar(20) NOT NULL DEFAULT 'available',
  config_schema_version   integer NOT NULL DEFAULT 1,
  config_schema_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_modules_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_core                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_module_catalog
  ADD CONSTRAINT system_module_catalog_category_check
  CHECK (category IN ('core', 'optional', 'compliance', 'payment', 'communication', 'integration'));

ALTER TABLE system_module_catalog
  ADD CONSTRAINT system_module_catalog_status_check
  CHECK (availability_status IN ('available', 'restricted', 'retired'));
```

The initial migration should seed this table from `CLINIC_MODULE_CATALOG`, `CLINIC_CORE_MODULES`, and the explicitly supported provider modules. The existing TypeScript registry should remain the fallback for deployments that have not yet enabled database-managed module metadata.

## 5. Tenant regional profile

A tenant needs one explicit regional/compliance profile, but it must be optional during progressive setup. The profile does not itself enable ETA, Fawry, or any other provider.

```sql
CREATE TABLE tenant_regional_profiles (
  tenant_id                    uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  country_code                 varchar(2),
  profile_key                  varchar(80) NOT NULL DEFAULT 'generic',
  status                       varchar(20) NOT NULL DEFAULT 'incomplete',
  national_identifier_policy  varchar(80) NOT NULL DEFAULT 'generic',
  phone_policy                 varchar(80) NOT NULL DEFAULT 'international_or_local',
  tax_profile_key              varchar(80),
  metadata_json                jsonb NOT NULL DEFAULT '{}'::jsonb,
  version                      integer NOT NULL DEFAULT 1,
  configured_by                uuid REFERENCES users(id) ON DELETE SET NULL,
  configured_at                timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_regional_profiles
  ADD CONSTRAINT tenant_regional_profiles_status_check
  CHECK (status IN ('incomplete', 'configured', 'invalid'));
```

Recommended behavior:

| Field | Meaning |
|---|---|
| `country_code` | Optional ISO country code selected by the tenant administrator. |
| `profile_key` | A deployment-supported policy such as `generic` or `egypt`. |
| `national_identifier_policy` | Which validation policy applies to patient identifiers. |
| `phone_policy` | Which phone normalization policy applies. |
| `tax_profile_key` | Which tax/compliance rules are available to the tenant. |
| `metadata_json` | Nonsecret profile-specific settings that are not worth separate columns. |

No provider credentials belong in this table.

## 6. Generic module configuration

Existing clinic-wide values such as display name, locale, timezone, currency, and working hours should continue to use `clinic_config_entries`. Module-specific nonsecret values should use a separate table so the generic registry is not overloaded with every provider’s fields.

```sql
CREATE TABLE tenant_module_configurations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key            varchar(80) NOT NULL,
  config_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version        integer NOT NULL DEFAULT 1,
  version               integer NOT NULL DEFAULT 1,
  last_validation_status varchar(20) NOT NULL DEFAULT 'incomplete',
  last_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  validated_at          timestamptz,
  updated_by            uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);

ALTER TABLE tenant_module_configurations
  ADD CONSTRAINT tenant_module_configurations_status_check
  CHECK (last_validation_status IN ('incomplete', 'valid', 'invalid', 'connection_failed'));
```

Examples of appropriate values include ETA invoice-series preferences or online-booking rules. Secret values, tokens, private keys, and passwords must not be placed in `config_json`.

## 7. Provider connections

A provider connection represents one configured external integration. It is separate from module activation because a clinic may activate a module before credentials are complete.

```sql
CREATE TABLE tenant_provider_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key            varchar(80) NOT NULL,
  provider_key          varchar(80) NOT NULL,
  display_name          varchar(160),
  environment           varchar(20) NOT NULL DEFAULT 'sandbox',
  status                varchar(24) NOT NULL DEFAULT 'setup_required',
  config_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_schema_version integer NOT NULL DEFAULT 1,
  version               integer NOT NULL DEFAULT 1,
  last_test_status      varchar(24) NOT NULL DEFAULT 'not_tested',
  last_tested_at        timestamptz,
  last_error_code       varchar(120),
  last_error_message    text,
  enabled_by            uuid REFERENCES users(id) ON DELETE SET NULL,
  enabled_at            timestamptz,
  disabled_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  disabled_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_key)
);

ALTER TABLE tenant_provider_connections
  ADD CONSTRAINT tenant_provider_connections_environment_check
  CHECK (environment IN ('sandbox', 'production'));

ALTER TABLE tenant_provider_connections
  ADD CONSTRAINT tenant_provider_connections_status_check
  CHECK (status IN ('setup_required', 'configured', 'enabled', 'disabled', 'invalid'));

ALTER TABLE tenant_provider_connections
  ADD CONSTRAINT tenant_provider_connections_test_status_check
  CHECK (last_test_status IN ('not_tested', 'passed', 'failed', 'expired'));
```

A stricter deployment may use `UNIQUE (tenant_id, module_key, provider_key)` instead of `UNIQUE (tenant_id, provider_key)` if the same provider can serve several modules.

## 8. Secret storage and rotation

The existing `clinic_integration_secrets` table should remain the compatibility layer. It should be extended as follows:

```sql
ALTER TABLE clinic_integration_secrets
  ADD COLUMN connection_id uuid REFERENCES tenant_provider_connections(id) ON DELETE CASCADE,
  ADD COLUMN secret_version integer NOT NULL DEFAULT 1,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN rotated_at timestamptz,
  ADD COLUMN rotated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN last_used_at timestamptz;
```

The existing uniqueness rule should be changed from `(tenant_id, provider, secret_key)` to `(connection_id, secret_key)` after all rows have a connection ID. During migration, keep the existing unique rule temporarily and backfill `connection_id` from `(tenant_id, provider)`.

For a stronger rotation history, add a separate table:

```sql
CREATE TABLE clinic_integration_secret_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         uuid NOT NULL REFERENCES tenant_provider_connections(id) ON DELETE CASCADE,
  secret_key            varchar(120) NOT NULL,
  version               integer NOT NULL,
  encrypted_value       text NOT NULL,
  value_hash            varchar(64),
  last_four             varchar(4),
  created_by            uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, secret_key, version)
);
```

Only the active encrypted value should be used at runtime. API responses should expose only metadata such as `configured: true`, `lastFour`, `rotatedAt`, and `expiresAt`.

## 9. Module activation and readiness

The existing `tenant_module_activations` table already contains `status`, `last_validation_status`, and `last_validation_errors`. Extend it instead of creating a duplicate readiness table:

```sql
ALTER TABLE tenant_module_activations
  ADD COLUMN last_validated_at timestamptz,
  ADD COLUMN readiness_version integer NOT NULL DEFAULT 1,
  ADD COLUMN setup_completed_at timestamptz,
  ADD COLUMN setup_completed_by uuid REFERENCES users(id) ON DELETE SET NULL;
```

Recommended state interpretation:

| Activation status | Readiness status | Meaning |
|---|---|---|
| `setup_required` | `incomplete` | Tenant has access but has not completed configuration. |
| `enabled` | `valid` | Module is active and all required settings pass validation. |
| `enabled` | `invalid` | Module is enabled but blocked only for operations requiring valid configuration. |
| `disabled` | Any | Module is unavailable to tenant users regardless of configuration. |

The readiness service should combine three sources:

1. Static requirements from the module/provider catalog.
2. Nonsecret values from `tenant_module_configurations` and `clinic_config_entries`.
3. Secret metadata from `clinic_integration_secrets` without exposing secret values.

## 10. Entitlement and activation rules

The authorization path should remain:

```text
system/vendor entitlement
  → tenant activation
    → module readiness
      → backend permission guard
        → branch/department scope policy
```

The database must not grant staff permissions. `tenant_module_entitlements` says whether the tenant may use a module, and `tenant_module_activations` says whether the tenant enabled it. Existing RBAC permissions still decide whether an individual user can view, create, edit, approve, or administer the operation.

## 11. Audit metadata

The existing `audit_logs` table is sufficient for the first implementation. Add nullable context columns to make provider and settings changes easier to filter:

```sql
ALTER TABLE audit_logs
  ADD COLUMN module_key varchar(80),
  ADD COLUMN provider_key varchar(80),
  ADD COLUMN scope_type varchar(20),
  ADD COLUMN scope_id uuid,
  ADD COLUMN request_id varchar(120);

CREATE INDEX audit_logs_tenant_module_time_idx
  ON audit_logs (tenant_id, module_key, timestamp);

CREATE INDEX audit_logs_tenant_provider_time_idx
  ON audit_logs (tenant_id, provider_key, timestamp);
```

Secret values must never be written into `changes`. Audit events should record metadata such as `secret.created`, `secret.rotated`, `provider.tested`, `module.enabled`, `module.disabled`, `regional_profile.updated`, and `clinic_configuration.updated`.

## 12. Tenant and scope safety rules

Every tenant-owned table must include `tenant_id` and a foreign key to `tenants(id)` with `ON DELETE CASCADE`. Every write must verify that the authenticated principal belongs to the same tenant.

Branch and department scoped generic settings should continue using `clinic_config_entries`. Because `scope_id` is polymorphic, the service must enforce the following rules before insert or update:

| Scope type | Required scope ID | Ownership check |
|---|---|---|
| `tenant` | Tenant ID | `scope_id = tenant_id` |
| `branch` | Branch ID | Branch belongs to `tenant_id` |
| `department` | Department ID | Department belongs to `tenant_id` and its branch, if applicable |

Provider credentials and regional profiles should be tenant-wide in the first version. Branch-specific payment credentials, tax registrations, or provider accounts should not be introduced until the operational use case is proven; they create significant routing, secret rotation, and audit complexity.

## 13. Migration sequence

The safest implementation sequence is incremental and reversible at the application level:

| Migration | Action |
|---|---|
| `053_module_catalog` | Create and seed `system_module_catalog` from the current TypeScript catalog. Do not remove the TypeScript fallback. |
| `054_regional_profiles` | Create `tenant_regional_profiles`; insert one `generic/incomplete` row per tenant. |
| `055_module_configurations` | Create `tenant_module_configurations`; leave existing activation records authoritative until reads are migrated. |
| `056_provider_connections` | Create `tenant_provider_connections`; backfill existing `clinic_integration_secrets` providers into connection rows. |
| `057_secret_connection_metadata` | Add `connection_id`, rotation metadata, and active flags to `clinic_integration_secrets`; backfill and validate. |
| `058_activation_readiness_metadata` | Add validation timestamps and setup-completion metadata to `tenant_module_activations`. |
| `059_audit_context` | Add module/provider/scope/request metadata to `audit_logs`. |
| `060_provider_backfill` | Convert existing legacy provider settings into provider-specific nonsecret configuration and encrypted secret rows. |

Each migration should be forward-safe, use `hasTable`/`hasColumn` guards consistent with the repository, and avoid destructive rollback of tenant configuration or encrypted secrets.

## 14. API service boundaries

The backend should expose separate services rather than one unrestricted settings service:

| Service | Responsibility |
|---|---|
| `clinicConfigurationService` | Generic registry-backed values and branch/department inheritance. |
| `regionalProfileService` | Tenant country and policy selection. |
| `moduleCatalogService` | Read-only catalog and system/vendor availability. |
| `moduleActivationService` | Tenant activation and readiness status. |
| `providerConnectionService` | Nonsecret provider configuration and connection tests. |
| `integrationSecretService` | Encrypted secret write, rotation, metadata read, and revocation. |
| `integrationAuditService` | Structured audit events with secret redaction. |

The frontend should receive a sanitized provider view such as:

```json
{
  "providerKey": "fawry",
  "status": "setup_required",
  "environment": "sandbox",
  "config": {
    "merchantCode": "configured"
  },
  "secrets": {
    "apiKey": { "configured": true, "lastFour": "7A91" }
  },
  "readiness": {
    "status": "incomplete",
    "missing": ["merchantCode", "connectionTest"]
  }
}
```

No plaintext credential should be returned after it is saved.

## 15. Recommended first implementation boundary

The first implementation should add `tenant_regional_profiles`, `tenant_module_configurations`, and `tenant_provider_connections`, while extending the existing activation and secret tables. It should not yet create branch-specific provider credentials, database-enforced JSON schemas for every provider, or a fully dynamic module catalog editor.

That boundary gives administrators the required Settings experience without duplicating the clinic registry, bypassing RBAC, exposing secrets, or making provider-specific assumptions part of the generic clinic core.
