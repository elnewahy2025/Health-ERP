# Modular Clinic Settings Implementation Status

**Project:** Health-ERP Clinic Management System  
**Status date:** 19 August 2026  
**Repository branch:** `main`  
**Latest commit:** `7ac98f8`

## Executive status

The modular regional and provider configuration foundation is implemented and pushed to `origin/main`. The work is incremental and preserves the existing clinic configuration hierarchy, tenant isolation, branch and department scopes, RBAC permissions, legacy settings facade, and existing workflows.

Administrators can now complete regional configuration progressively and manage supported provider connections from **Settings → Integrations**. Provider secret values are encrypted before storage and are never returned to the browser. Provider activation does not grant staff permissions; the existing backend authorization chain remains mandatory for all operational routes.

> The provider “Test Connection” action currently performs a persisted configuration/readiness validation and records the result. It does not invent vendor-specific network handshakes where the repository does not yet contain a provider adapter contract. Actual Fawry, Stripe, SMS, and voice operations now consume tenant-scoped credentials when configured and return clear not-ready/provider errors instead of silently using the wrong tenant’s credentials.

## Delivered implementation slices

| Commit | Slice | Result |
|---|---|---|
| `c88bc11` | Modular settings schema foundation | Added forward-safe migration 053 and the complete schema design document. |
| `8e584ee` | Guarded backend settings APIs | Added regional profile and provider configuration services/routes with settings RBAC, optimistic versions, audits, and redacted secret metadata. |
| `5dedbbc` | Provider validation status | Provider validation now persists last-test status, timestamp, and safe error metadata. |
| `93e9709` | Integrations settings UI | Added the bilingual Integrations tab, regional profile editor, dynamic provider cards, readiness checklist, environment selection, secret rotation/revocation, and typed API client methods. |
| `7507848` | Safety tests | Added focused tests for secret redaction, route authorization, provider catalog invariants, migration rollback safety, and operational wiring assertions. |
| `3e30da6` | Twilio backward compatibility | Preserved legacy Twilio account, auth, messaging, WhatsApp, and voice settings in the supported provider catalog. |
| `6846190` | ETA module storage boundary | ETA configuration is stored in `tenant_module_configurations`; Fawry’s `currencyCode` is a provider protocol field and is not a clinic default. |
| `cbd79bd` | Operational provider consumption | Added backend-only runtime resolution and wired tenant provider settings into Stripe checkout, Fawry creation, SMS, and voice operations with safe fallback for unconfigured legacy tenants. |
| `7ac98f8` | Callback provider resolution | Stripe confirmation, Fawry callback secret selection, and Twilio voice callback validation now recover tenant context before selecting provider secrets. |

## Database and security model

Migration `053_modular_clinic_settings.ts` creates or extends the following structures with `hasTable` and `hasColumn` guards:

| Table or extension | Purpose |
|---|---|
| `tenant_regional_profiles` | Tenant country, regional profile key, national identifier policy, phone policy, tax profile key, status, version, and metadata. |
| `tenant_module_configurations` | Nonsecret module-specific configuration such as ETA configuration, validation status, errors, schema version, and optimistic version. |
| `tenant_provider_connections` | Tenant-wide provider connection metadata: provider, environment, status, nonsecret configuration, validation status, and error metadata. |
| `clinic_integration_secrets` extensions | Connection linkage, secret version, active state, rotation metadata, expiry, and last-used metadata. Existing encrypted secrets are preserved. |
| `audit_logs` extensions | Module, provider, scope, and request context fields for future audit correlation. |

Existing tenants receive an incomplete generic regional profile. Existing integration secrets are linked to tenant provider connection records when possible. The migration `down()` function does not delete tenant configuration, provider links, secrets, or audit history.

Secret values follow this path: administrator input → server-side encryption → encrypted database value. API responses include only `configured`, `lastFour`, version, rotation, and expiry metadata. The backend-only runtime resolver is not imported by frontend code or HTTP response mappers.

## Supported provider catalog

The current catalog is intentionally explicit rather than seeded with fake clinic data.

| Provider | Tenant configuration | Secret metadata | Regional rule |
|---|---|---|---|
| ETA | Stored under module key `eta` in `tenant_module_configurations` | Client ID, client secret, signing key | Requires country code `EG` for readiness. |
| Fawry | Merchant code, reference prefix, and provider `currencyCode` | Secure key and hash key | Requires country code `EG` for readiness. `EGP` is not inserted as a clinic default. |
| Stripe | Currency and other nonsecret provider configuration | Secret key, publishable key, webhook secret | No country restriction in the foundation. |
| Twilio | No required nonsecret configuration in the current legacy-compatible catalog | Account SID, auth token, messaging service SID, WhatsApp number, voice number | No country restriction in the foundation. |

Provider connections are tenant-wide in this version. Branch-specific provider connections were intentionally not introduced, so the first release cannot accidentally select a branch credential for a tenant-wide payment or communication operation.

## Backend API contract

All routes below use the existing `settings.view` or `settings.manage` permissions. The backend remains authoritative; frontend gates are only user-experience controls.

| Method | Route | Permission | Behavior |
|---|---|---|---|
| GET | `/api/v1/clinic-regional-profile` | `settings.view` | Returns the tenant regional profile. |
| PUT | `/api/v1/clinic-regional-profile` | `settings.manage` | Updates the regional profile with validation and optimistic versioning. |
| GET | `/api/v1/clinic-providers` | `settings.view` | Returns provider cards, nonsecret configuration, readiness, and safe secret metadata only. |
| PUT | `/api/v1/clinic-providers/:providerKey` | `settings.manage` | Updates provider connection metadata and provider/module configuration. |
| POST | `/api/v1/clinic-providers/:providerKey/test` | `settings.manage` | Validates readiness and persists last-test status and safe error metadata. |
| PUT | `/api/v1/clinic-providers/:providerKey/secrets/:secretKey` | `settings.manage` | Encrypts and rotates one provider secret. |
| DELETE | `/api/v1/clinic-providers/:providerKey/secrets/:secretKey` | `settings.manage` | Revokes one provider secret without deleting tenant history. |

Two namespaced `/api/v1/clinic-provider-configurations` routes remain as internal-compatible aliases for the initial implementation slice.

## Administrator operating procedure

Open **Settings → Integrations**. First complete the **Regional Profile**. Enter the clinic’s ISO 3166-1 alpha-2 country code, choose the national identifier and phone policies, optionally enter a tax profile key, and save. Use `incomplete` while setup is in progress; the application does not block normal clinic work because the profile is incomplete.

Next, configure only the providers the clinic actually uses. Choose the sandbox or production environment, enter nonsecret fields, and save the provider. Then enter each secret separately and save it. The interface clears secret inputs after saving and shows only safe metadata such as whether a secret is configured and its last four characters. Revoking a secret makes the provider incomplete or unavailable without deleting the audit trail.

Use the readiness checklist on each provider card. Missing entries are shown as `config:<field>` or `secret:<field>`. A country mismatch is reported as an invalid regional/provider combination. Complete setup before using the related operational workflow. Module activation and provider configuration do not assign application permissions to staff; administrators must continue to manage roles and permission grants separately.

## Operational behavior and fallback policy

For a tenant with no provider connection record, legacy environment variables remain available as a compatibility fallback. This allows existing installations to continue operating while administrators progressively move credentials into Settings. Once a tenant provider connection exists, the operational service uses that tenant’s provider state; an incomplete or disabled tenant connection is not silently replaced with another tenant’s credentials or with a fake successful operation.

The following paths now use tenant-scoped runtime credentials when available:

| Operational path | Tenant resolution |
|---|---|
| Stripe checkout creation | Uses the authenticated billing tenant ID. |
| Stripe confirmation | Recovers tenant ID from the stored payment transaction before selecting the Stripe secret. |
| Fawry payment creation | Uses the authenticated billing tenant ID and returns a clear readiness error if merchant configuration is incomplete. |
| Fawry callback secret selection | Recovers tenant ID from the stored payment reference when available. |
| SMS notifications and reminders | Passes the notification tenant ID into the Twilio runtime resolver. |
| Outbound voice and conferences | Uses the tenant ID already carried by the voice route. |
| Twilio voice status callback | Recovers tenant ID from the stored voice call before validating the callback signature. |

WhatsApp remains on its existing separate Meta provider configuration path because it is not represented by the Twilio provider catalog in this foundation. Vendor-specific ETA invoice submission and true provider network handshakes should be implemented as separate adapters once their exact API contracts, endpoints, certificate requirements, and test environments are supplied.

## Validation results

The final validation completed successfully. Backend lint passed. Backend tests passed with **30 test files, 232 tests passed, and 3 intentionally skipped integration tests**. Frontend tests passed with **11 test files and 43 tests passed**. Backend and frontend production builds passed, and `git diff --check` passed. The working tree is clean and `HEAD` matches `origin/main` at commit `7ac98f8`.

The backend test run still prints existing non-failing warnings about Redis connection attempts in the isolated test environment and the audit test’s intentionally swallowed database-write failure. These warnings did not fail the suite and were not introduced by the modular settings work.

## Rollback and deployment notes

Deploy migration 053 before deploying the backend build that exposes the new routes. Because the migration is forward-safe, a rollback of application code does not require deleting the new tables or columns. Keep migration 053 applied. If the application build must be reverted, the existing legacy clinic settings facade, legacy environment provider fallback, and pre-existing workflows remain available.

Before production use, set a strong `ENCRYPTION_KEY` and back up the PostgreSQL database. Existing provider secrets should be rotated through Settings after migration if their provenance is uncertain. Use sandbox environments first, validate provider readiness, and then switch the provider environment to production only after the vendor account is ready.

## Next recommended implementation slice

The next production-hardening slice should add provider adapter interfaces and vendor-specific live validation for ETA, Fawry, Stripe, and Twilio. Each adapter should define its own request signing, endpoint configuration, timeout policy, retry behavior, certificate handling, and response sanitization. That work must be done without placing vendor secrets in frontend code or reintroducing country-specific defaults into the generic clinic core.
