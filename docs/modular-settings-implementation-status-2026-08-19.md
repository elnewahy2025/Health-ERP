# Modular Clinic Settings Implementation Status

**Project:** Health-ERP Clinic Management System  
**Status date:** 19 August 2026  
**Repository branch:** `main`  
**Latest implementation commit:** `fb45fa6`

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
| `15ab9b6` | Structural provider adapters | Added safe ETA, Fawry, Stripe, and Twilio adapter validation with provider-specific required fields, no network calls, and safe result codes. |
| `b4199f2` | Opt-in live-validation controls | Added migration 054, provider-configurable validation mode, live opt-in, timeout, endpoint URL, safe endpoint allowlisting, bilingual controls, and deterministic probe tests. |
| `5e4272e` | Backward-compatible policy persistence | Preserved existing validation policy values when older clients save provider configuration and mapped persisted live/structural failures accurately. |
| `c8f4016` | Versioned provider contracts | Exposed contract version and capability states for ETA, Fawry, Stripe, and Twilio; distinguishes implemented checks from unverified authentication and unsupported business operations. |
| `fb45fa6` | Provider-operation guards | Added formal guards for Fawry, Stripe, SMS, and Twilio operations, and replaced the simulated ETA submission approval with an explicit safe unsupported response. |

## Database and security model

Migrations `053_modular_clinic_settings.ts` and `054_provider_live_validation_policy.ts` create or extend the following structures with `hasTable` and `hasColumn` guards:

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

## Live-validation controls

Migration 054 adds `validation_mode`, `live_validation_enabled`, and `validation_timeout_ms` to each tenant provider connection. Existing connections default to structural validation, live validation disabled, and a five-second timeout. Administrators can select **Configuration only** or **Live validation**, explicitly enable live validation, and set a bounded timeout between one and thirty seconds. Provider endpoint URLs are stored as nonsecret configuration fields; they are never allowed to contain embedded credentials.

Live validation is intentionally opt-in. Production endpoints must use HTTPS. Localhost, link-local, private IPv4 ranges, loopback, and private IPv6 ranges are blocked to prevent an administrator mistake from turning the application into an internal-network request proxy. Live probes send only a simple GET request with generic `Accept` headers and never send provider secrets, authentication headers, payment data, or clinic records. Redirects are rejected, responses are not parsed as trusted provider payloads, and timeout or HTTP failures are mapped to safe status codes.

## Versioned provider contracts

The provider API now returns a versioned contract for every supported provider. Capability states explicitly distinguish **implemented** structural validation and endpoint reachability from **not verified** vendor authentication and **not implemented** business operations. This prevents a green configuration check from being interpreted as proof that a vendor account, signing certificate, payment rail, tax submission workflow, or messaging account is operational.

The Settings page displays these capability states and the contract version for administrators. Unknown provider keys return a safe unsupported result rather than falling through to an inferred or unregistered adapter.

## Provider adapter validation semantics

The provider test endpoint now delegates to a provider adapter registry. Structural checks always run first. If the saved policy is `live` and `live_validation_enabled` is true, the adapter then performs only the configured endpoint reachability probe. Structural results record a safe code, readiness status, missing field names, and `testMode: structural`; live results record a safe endpoint status and `testMode: live`. Neither result includes decrypted secret values.

This is deliberately not presented as a fabricated vendor handshake. The current live probe sends no provider credentials and does not claim that ETA, Fawry, Stripe, or Twilio authentication or business APIs are valid. Vendor-specific handshakes remain a separate adapter step requiring the exact vendor endpoint, signing algorithm, certificate requirements, timeout, retry, and response-sanitization contract. Decryption failures are returned as a generic safe invalid result. Twilio accepts one configured sender option for voice or messaging while preserving optional legacy secret fields, and Fawry requires an administrator-entered three-letter `currencyCode` without inserting `EGP` as a clinic default.

## Provider-operation guards

Provider operation call sites now use the registered capability contract before executing. Fawry creation and callback verification, Stripe checkout and confirmation, Twilio SMS, outbound voice, conference calls, and voice callback verification are registered as supported runtime operations. ETA invoice QR generation remains a local clinic operation, but ETA invoice submission is not registered as a vendor operation and now returns HTTP 409 with `PROVIDER_OPERATION_NOT_SUPPORTED` instead of generating a fake approval UUID.

These guards do not replace RBAC. Existing route permissions remain mandatory: billing permissions protect payments, `voice_calls.create` protects voice creation, `eta_invoicing.manage` protects ETA submission, and settings permissions protect provider configuration. The guard is an additional provider-contract boundary, not a frontend-only gate.

## Validation results

The final validation completed successfully. Backend lint passed. Backend tests passed with **33 passed test files, 1 skipped integration file, 244 tests passed, and 3 skipped tests**. Frontend tests passed with **11 test files and 43 tests passed**. Backend and frontend production builds passed, and `git diff --check` passed. Validation was run against implementation commit `fb45fa6`; the documentation update is committed separately.

The backend test run still prints existing non-failing warnings about Redis connection attempts in the isolated test environment and the audit test’s intentionally swallowed database-write failure. These warnings did not fail the suite and were not introduced by the modular settings work.

## Rollback and deployment notes

Deploy migration 053 before deploying the backend build that exposes the new routes. Because the migration is forward-safe, a rollback of application code does not require deleting the new tables or columns. Keep migration 053 applied. If the application build must be reverted, the existing legacy clinic settings facade, legacy environment provider fallback, and pre-existing workflows remain available.

Before production use, set a strong `ENCRYPTION_KEY` and back up the PostgreSQL database. Existing provider secrets should be rotated through Settings after migration if their provenance is uncertain. Use sandbox environments first, validate provider readiness, and then switch the provider environment to production only after the vendor account is ready.

## Next recommended implementation slice

The next production-hardening slice should add provider adapter interfaces and vendor-specific live validation for ETA, Fawry, Stripe, and Twilio. Each adapter should define its own request signing, endpoint configuration, timeout policy, retry behavior, certificate handling, and response sanitization. That work must be done without placing vendor secrets in frontend code or reintroducing country-specific defaults into the generic clinic core.
