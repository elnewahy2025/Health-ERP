# Modular Clinic Settings Implementation Status

**Project:** Health-ERP Clinic Management System  
**Status date:** 19 August 2026  
**Repository branch:** `main`  
**Latest implementation commit:** `911102a`

## Executive status

The modular regional and provider configuration foundation is implemented and pushed to `origin/main`. The work is incremental and preserves the existing clinic configuration hierarchy, tenant isolation, branch and department scopes, RBAC permissions, legacy settings facade, and existing workflows.

Administrators can now complete regional configuration progressively and manage supported provider connections from **Settings → Integrations**. Provider secret values are encrypted before storage and are never returned to the browser. Provider activation does not grant staff permissions; the existing backend authorization chain remains mandatory for all operational routes.

> The provider “Test Connection” action performs a persisted configuration/readiness validation and records the result. The Fawry payment-reference operation now has a tenant-configured signed request boundary and safe response normalization, but no claim is made that a clinic’s real vendor account is live until administrators run it against the vendor sandbox with their own credentials. Stripe, SMS, and voice operations continue to consume tenant-scoped credentials when configured and return clear not-ready/provider errors instead of silently using the wrong tenant’s credentials.

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
| `bb31789` | Operational provider UX | Added a shared frontend provider-error classifier and actionable bilingual readiness messages for ETA submission and SMS test delivery. |
| `fb4d3a8` | Billing provider actions | Added separate permission-gated Stripe checkout and Fawry payment-reference actions; kept internal payment recording separate and avoided frontend currency or payment URL defaults. |
| `f2fe3aa` | External payment status visibility | Added nullable `provider_key` tracking, Fawry/Stripe callback isolation, a tenant-scoped nonsecret provider-payment history endpoint, and bilingual Billing status history. Internal cash/card records remain provider-neutral. |
| `602a162` | Provider-payment access hardening | Corrected invoice scope lookup to use patient branch data, excluded soft-deleted invoices, added patient tenant predicates, implemented department-aware appointment checks, and added executable route-level isolation tests. |
| `1a72726` | Shared department-scope enforcement | Replaced invalid `patients.department_id` assumptions with tenant-scoped appointment/doctor department predicates across patient-linked policies; corrected patient, appointment, and EMR scope resolvers. |
| `7e760b9` | Billing department-scope routing | Ensured billing department grants use the shared department policy instead of assigned-patient filtering. |
| `fc5364b` | Provider callback hardening | Added Stripe raw-body signature verification, Fawry V2 SHA-256 verification, tenant/provider/reference binding, exact amount reconciliation, atomic invoice updates, idempotent finalization, CSRF callback exemptions, and callback route tests. |
| `da5f95a` | Fawry callback contract tightening | Requires the documented Fawry V2 payment and order amount fields before signature verification. |
| `0b2822f` | PostgreSQL integration execution | Added a tsx-backed migration runner for both PostgreSQL integration suites, fixed real-schema integration assertions, and made billing detail authorization use one effective permission scope instead of falling through to narrower scopes. |
| `4eaeed8` | PostgreSQL RLS tenant context | Added request-scoped AsyncLocalStorage transaction routing, sets `app.current_tenant` with transaction-local configuration after authentication, commits on successful responses, rolls back on errors, and adds FORCE RLS integration coverage. |
| `5f1249c` | Authenticated Fastify RLS lifecycle | Exported `buildApp()` for integration testing, added bearer-authentication request hooks and request transaction finalization, guarded server auto-start during lifecycle tests, removed duplicate advanced-communication route registrations, added the lifecycle integration target, and verified commit, rollback, and pooled-connection cleanup under FORCE RLS. |
| `8427421` | Provider adapter contract foundation | Added typed execution and callback contract contexts, operation result shapes, derived operation metadata, safe unknown-provider handling, and shared contract metadata on every registered structural adapter without changing existing provider execution paths. |
| `e55c5e9` | Fawry sandbox request boundary | Added the tenant-configured Fawry payment-reference adapter, official request/signature shape, safe response handling, separate provider-reference storage, authenticated route coverage, required customer email validation, and bilingual UI alignment. |
| `6ffb1f2` | Function 2: durable backup and restore verification | Replaced simulated backups with encrypted tenant-scoped logical snapshots, durable local/MinIO artifact storage, asynchronous worker processing, retention deletion, isolated restore drills, verification audit records, stale-job recovery, and dedicated DR permissions. |
| `a2648e0` | Function 3: durable data export and FHIR mapping | Replaced synthetic row counts and paths with encrypted tenant-scoped CSV/JSON artifacts, authenticated binary downloads, retention cleanup, audit events, dedicated download permission, and real FHIR R4 resource mapping. |
| `9ee5c0a` | Function 4: durable report execution and downloads | Replaced immediate zero-row completion and synthetic download URLs with scoped report queries, asynchronous worker execution, readable CSV/PDF/Excel/JSON artifacts, encrypted storage, checksum verification, retention cleanup, and dedicated report-download permission. |
| `fc7116f` | Function 4 scope hardening | Added immutable execution-scope checks at download time and same-tenant cross-branch integration coverage, preventing a user from downloading an artifact created for another branch scope. |
| `471c8ae` | Function 5: real ETA e-invoicing workflow | Added tenant-configured ETA invoice construction, official OAuth token flow, dynamic document-type-version retrieval, ETA JSON canonicalization, CAdES-BES signing, idempotent submission, asynchronous status polling, API-key callback verification and deduplication, retry/failure state, worker lifecycle, and bilingual operational UX. |
| `911102a` | Function 6: manual InstaPay reconciliation workflow | Replaced the unlinked placeholder with tenant-configured manual transfer instructions, invoice-linked pending requests, distinct `billing.verify` authorization, immutable instruction snapshots, exact amount matching, atomic invoice settlement, idempotent reconciliation/rejection, safe legacy callback behavior, and bilingual Billing UX. |

## Database and security model

Migrations `053_modular_clinic_settings.ts`, `054_provider_live_validation_policy.ts`, `055_payment_provider_status.ts`, `056_payment_callback_hardening.ts`, `057_provider_reference.ts`, `058_pharmacy_safety.ts`, `059_backup_restore_verification.ts`, `060_normalize_backup_types.ts`, `061_durable_data_exports.ts`, `062_durable_report_artifacts.ts`, `063_eta_submission_workflow.ts`, `064_eta_internal_id.ts`, `065_manual_instapay_reconciliation.ts`, and `066_manual_instapay_verification_grant.ts` create or extend the following structures with `hasTable` and `hasColumn` guards. PostgreSQL integration tests apply the same TypeScript migrations through the dedicated `tsx` runner before Vitest starts:

| Table or extension | Purpose |
|---|---|
| `tenant_regional_profiles` | Tenant country, regional profile key, national identifier policy, phone policy, tax profile key, status, version, and metadata. |
| `tenant_module_configurations` | Nonsecret module-specific configuration such as ETA configuration, validation status, errors, schema version, and optimistic version. |
| `tenant_provider_connections` | Tenant-wide provider connection metadata: provider, environment, status, nonsecret configuration, validation status, and error metadata. |
| `clinic_integration_secrets` extensions | Connection linkage, secret version, active state, rotation metadata, expiry, and last-used metadata. Existing encrypted secrets are preserved. |
| `audit_logs` extensions | Module, provider, scope, and request context fields for future audit correlation. |
| `eta_invoices` extensions | Migration 063 adds request/document hashes, internal ID, document version, submission UUID, long ID, provider/status payloads, attempts, retry timing, status checks, HTTP/error metadata, and provider environment. Migration 064 adds forward-safe internal-ID correlation for already migrated databases. |
| `eta_notification_deliveries` | Tenant-scoped callback delivery IDs and payloads for idempotent ETA notification processing. |
| `manual_instapay_reconciliations` | Tenant-scoped invoice-linked transfer requests, immutable destination/instruction snapshots, workflow status, statement reference, verified amount/date, decision notes, and verifier evidence. Partial and rejected requests remain auditable. |
| `role_template_catalog` extension | Migration 066 adds `billing.verify` to the seeded billing manager, billing officer, and accountant templates only; custom tenant roles are not rewritten. |
| `payment_transactions` extension | Migration 055 adds nullable `provider_key`, indexes it, and backfills existing Fawry and Stripe rows. Migration 056 adds nullable `updated_at` with a created-time backfill and a tenant/provider/merchant-reference lookup index. Migration 057 adds nullable `provider_reference` for the external reference returned by a provider. Migration 065 links manual InstaPay ledger rows to dedicated reconciliation records; manual rows use `provider_key = 'instapay_manual'` only for classification and are excluded from external-provider history. Internal cash/card transactions remain `NULL`. |

Existing tenants receive an incomplete generic regional profile. Existing integration secrets are linked to tenant provider connection records when possible. Backup configuration types are normalized forward to the implemented `logical` snapshot type; legacy simulated `full` and `incremental` values are not restored by migration rollback because they no longer describe a supported durable format. The backup migration `down()` function removes only its additive verification columns/table and does not delete tenant configuration, backup artifacts, or audit history.

Secret values follow this path: administrator input → server-side encryption → encrypted database value. API responses include only `configured`, `lastFour`, version, rotation, and expiry metadata. The backend-only runtime resolver is not imported by frontend code or HTTP response mappers.

## Supported provider catalog

The current catalog is intentionally explicit rather than seeded with fake clinic data.

| Provider | Tenant configuration | Secret metadata | Regional rule |
|---|---|---|---|
| ETA | Stored under module key `eta`: tax registration, invoice series, activity code, identity/system API endpoints, document type/version IDs, issuer branch, currency, tax type/rate, and tax calculation mode | Client ID, client secret, CAdES-BES signing certificate/private key, optional passphrase, and callback API key | Requires country code `EG` for readiness. Real operation requires EGP configuration and a valid ETA document version. |
| Fawry | Merchant code, merchant-reference prefix, provider `currencyCode`, provider language, payment endpoint URL, and optional validation endpoint URL | Secure key and hash key | Requires country code `EG` for readiness. The payment endpoint, language, and currency are administrator-configured; `EGP` is not inserted as a clinic default. |
| Stripe | Currency and other nonsecret provider configuration | Secret key, publishable key, webhook secret | No country restriction in the foundation. |
| Twilio | No required nonsecret configuration in the current legacy-compatible catalog | Account SID, auth token, messaging service SID, WhatsApp number, voice number | No country restriction in the foundation. |
| InstaPay manual | Wallet/account destination, account name, tenant reference prefix, and administrator-authored transfer instructions | None; this is not an external provider credential or verified online rail | Manual-only workflow. It uses the tenant clinic currency and requires staff statement verification before settlement. |

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
| GET | `/api/v1/invoices/:invoiceId/provider-payments` | `billing.view` | Returns tenant-scoped external payment history with only `id`, `providerKey`, `status`, `amount`, `reference`, `createdAt`, and `updatedAt`. |
| GET | `/api/v1/dr/backups` | `dr_backup.view` | Lists tenant-scoped backup configurations and execution audit records without exposing encrypted artifact contents. |
| POST | `/api/v1/dr/backup-configs` | `dr_backup.create` | Creates a tenant-scoped logical backup configuration without granting permissions to staff. |
| PUT | `/api/v1/dr/backup-configs/:id` | `dr_backup.edit` | Updates backup schedule, retention, storage location, and exclusion settings. |
| POST | `/api/v1/dr/backups/run` | `dr_backup.create` | Queues a pending backup for durable worker processing; it does not claim completion synchronously. |
| POST | `/api/v1/dr/backups/:backupId/verify-restore` | `dr_backup.verify` | Restores one completed artifact into the separately configured isolated database and records checksum, row count, status, and safe error metadata. |
| GET | `/api/v1/dr/restore-verifications` | `dr_backup.view` | Lists tenant-scoped restore verification history. |
| POST | `/api/v1/export/run` | `data_export.export` | Validates module, format, columns, filters, deleted-record policy, and retention, then queues a durable tenant-scoped export job. |
| GET | `/api/v1/export/jobs` | `data_export.view` | Lists tenant-scoped export job metadata without exposing raw storage paths. |
| GET | `/api/v1/export/download/:jobId` | `data_export.download` | Rechecks tenant ownership, artifact expiry, checksum, and storage integrity, then streams the decrypted artifact bytes. |
| GET | `/api/v1/export/fhir/:resourceType` | `data_export.view` | Returns a tenant-bound FHIR R4 Bundle for supported real resources; caller-supplied tenant slugs are ignored. |
| POST | `/api/v1/eta/invoices/generate` | `eta_invoicing.create` | Validates tenant ETA configuration, retrieves the configured published invoice document version, maps real invoice lines and configured tax rules, and stores a draft without hardcoded activity, currency, or tax defaults. |
| POST | `/api/v1/eta/invoices/:id/submit` | `eta_invoicing.manage` | Canonicalizes the unsigned document, hashes it with SHA-256, creates a CAdES-BES issuer signature from tenant-managed certificate material, submits through ETA, records provider IDs and response state, and returns asynchronous `202` status. |
| GET | `/api/v1/eta/invoices/:id/status` | `eta_invoicing.view` | Polls the recorded ETA submission UUID and normalizes provider document status and validation payload. |
| PUT | `/api/v1/eta/notifications/documents` | ETA API key | Verifies the configured tenant callback key, deduplicates ETA delivery IDs, and applies document validation, issuance, rejection, and cancellation events. |
| POST | `/api/v1/payments/fawry/create` | `billing.create` | Validates the invoice and due amount, resolves the tenant’s Fawry configuration, submits a signed payment-reference request to the administrator-configured endpoint, and creates a local pending transaction only after a valid provider response. |
| POST | `/api/v1/payments/fawry/callback` | Provider signature | Verifies the documented Fawry V2 SHA-256 signature, binds the callback to one tenant/provider transaction, reconciles amount, and finalizes idempotently. |
| POST | `/api/v1/payments/stripe/webhook` | Provider signature | Verifies the Stripe-Signature raw-body HMAC, binds the event to one Stripe transaction, and delegates to idempotent Checkout confirmation. |

Two namespaced `/api/v1/clinic-provider-configurations` routes remain as internal-compatible aliases for the initial implementation slice.

## Administrator operating procedure

Open **Settings → Integrations**. First complete the **Regional Profile**. Enter the clinic’s ISO 3166-1 alpha-2 country code, choose the national identifier and phone policies, optionally enter a tax profile key, and save. Use `incomplete` while setup is in progress; the application does not block normal clinic work because the profile is incomplete.

Next, configure only the providers the clinic actually uses. Choose the sandbox or production environment, enter nonsecret fields, and save the provider. Then enter each secret separately and save it. The interface clears secret inputs after saving and shows only safe metadata such as whether a secret is configured and its last four characters. Revoking a secret makes the provider incomplete or unavailable without deleting the audit trail.

Use the readiness checklist on each provider card. Missing entries are shown as `config:<field>` or `secret:<field>`. A country mismatch is reported as an invalid regional/provider combination. Complete setup before using the related operational workflow. Module activation and provider configuration do not assign application permissions to staff; administrators must continue to manage roles and permission grants separately.

## Operational behavior and fallback policy

For a tenant with no provider connection record, legacy environment variables remain available as a compatibility fallback. This allows existing installations to continue operating while administrators progressively move credentials into Settings. Once a tenant provider connection exists, the operational service uses that tenant’s provider state; an incomplete or disabled tenant connection is not silently replaced with another tenant’s credentials or with a fake successful operation.

The following paths now use tenant-scoped runtime credentials when available. A legacy environment fallback remains available to older operational paths, but Fawry reference creation intentionally requires the Settings → Integrations fields that cannot be safely inferred from the old environment variables, including the endpoint, merchant-reference prefix, language, and provider currency.

| Operational path | Tenant resolution |
|---|---|
| Stripe checkout creation | Uses the authenticated billing tenant ID. |
| Stripe confirmation | Recovers tenant ID from the stored Stripe transaction before selecting the Stripe secret, verifies session metadata and amount, and finalizes invoice/payment state inside one transaction. |
| Fawry payment creation | Uses the authenticated billing tenant ID, rejects amounts above invoice due, requires configured merchant fields, language, currency, secure key, and payment endpoint, submits the documented signed request, and creates a pending transaction only after the provider returns a successful reference. The merchant reference used for callbacks and the provider reference shown in history are stored separately. |
| Fawry callback secret selection | Resolves exactly one Fawry transaction by provider and merchant reference before loading that tenant’s secure key. |
| SMS notifications and reminders | Passes the notification tenant ID into the Twilio runtime resolver. |
| Outbound voice and conferences | Uses the tenant ID already carried by the voice route. |
| Twilio voice status callback | Recovers tenant ID from the stored voice call before validating the callback signature. |
| External provider payment history | Reads only transactions with a non-null provider key and exposes no encrypted values, credentials, customer contact data, or secret metadata. |
| Billing detail authorization | Uses the highest effective grant scope for `billing.view`; a branch grant is not allowed to fall through into assigned-patient lookup. |

WhatsApp remains on its existing separate Meta provider configuration path because it is not represented by the Twilio provider catalog in this foundation. ETA now uses its own tenant-scoped adapter and does not claim live readiness until the configured certificate, provider credentials, document version, endpoint, and regional settings pass validation.

## Live-validation controls

Migration 054 adds `validation_mode`, `live_validation_enabled`, and `validation_timeout_ms` to each tenant provider connection. Existing connections default to structural validation, live validation disabled, and a five-second timeout. Administrators can select **Configuration only** or **Live validation**, explicitly enable live validation, and set a bounded timeout between one and thirty seconds. Provider endpoint URLs are stored as nonsecret configuration fields; they are never allowed to contain embedded credentials.

Live validation is intentionally opt-in. Production endpoints must use HTTPS. Localhost, link-local, private IPv4 ranges, loopback, and private IPv6 ranges are blocked to prevent an administrator mistake from turning the application into an internal-network request proxy. Live probes send only a simple GET request with generic `Accept` headers and never send provider secrets, authentication headers, payment data, or clinic records. Redirects are rejected, responses are not parsed as trusted provider payloads, and timeout or HTTP failures are mapped to safe status codes.

## Versioned provider contracts

The provider API now returns a versioned contract for every supported provider, including the structural-only `instapay_manual` profile. Capability states explicitly distinguish **implemented** structural validation, ETA OAuth/submission/status/callback paths, and endpoint reachability from **not verified** vendor account acceptance or certificate validity. Manual InstaPay has no vendor authentication, business API, callback, or live endpoint capability. This prevents a green configuration check from being interpreted as proof that a vendor account, signing certificate, payment rail, tax submission workflow, or messaging account is operational.

The Settings page displays these capability states and the contract version for administrators. Unknown provider keys return a safe unsupported result rather than falling through to an inferred or unregistered adapter.

## Provider adapter validation semantics

The provider test endpoint now delegates to a provider adapter registry. Structural checks always run first. If the saved policy is `live` and `live_validation_enabled` is true, the adapter then performs only the configured endpoint reachability probe. Structural results record a safe code, readiness status, missing field names, and `testMode: structural`; live results record a safe endpoint status and `testMode: live`. Neither result includes decrypted secret values.

This is deliberately not presented as a fabricated vendor handshake. The current live probe sends no provider credentials and does not claim that ETA, Fawry, Stripe, or Twilio authentication or business APIs are valid. Vendor-specific handshakes remain a separate adapter step requiring the exact vendor endpoint, signing algorithm, certificate requirements, timeout, retry, and response-sanitization contract. Decryption failures are returned as a generic safe invalid result. Twilio accepts one configured sender option for voice or messaging while preserving optional legacy secret fields, Fawry requires administrator-entered `currencyCode`, `language`, and `paymentEndpointUrl` values; it does not insert `EGP`, a language, or a vendor URL as a clinic default.

## Provider-operation guards

Provider operation call sites now use the registered capability contract before executing. Fawry creation and callback verification, Stripe checkout and confirmation, Twilio SMS, outbound voice, conference calls, and voice callback verification are registered as supported runtime operations. ETA invoice QR generation remains a local clinic operation, while ETA invoice submission, status polling, and callback verification are registered through the real ETA adapter and remain dependent on tenant readiness and provider responses. Manual InstaPay deliberately registers no provider runtime operation; its authenticated staff reconciliation service is a local ledger workflow, and the legacy callback endpoint never mutates data.

These guards do not replace RBAC. Existing route permissions remain mandatory: billing permissions protect payments, `voice_calls.create` protects voice creation, `eta_invoicing.manage` protects ETA submission, and settings permissions protect provider configuration. The guard is an additional provider-contract boundary, not a frontend-only gate.

## Operational provider UX

The ETA invoicing page now displays pending, processing, submitted, retry-scheduled, failed, approved, rejected, and cancelled states, supports authenticated status refresh, and keeps setup/provider guidance visible after the toast disappears. The Billing page separately labels InstaPay as manual, displays tenant-configured destination instructions and a local reference, and exposes statement-reference reconciliation and rejection only to `billing.verify` users. The communications test-send page shows Twilio setup guidance when an SMS template cannot be delivered, while email templates retain their existing generic failure behavior. Both flows preserve their existing backend authorization and do not attempt to bypass provider capability guards.

The billing page now exposes separate permission-gated Stripe checkout and Fawry payment-reference actions alongside the existing internal Record Payment action. Stripe receives the tenant-configured clinic currency only when available and otherwise lets the backend resolve it from clinic configuration. Fawry requires entered patient name, phone, and email fields, reports the provider-created pending reference, and does not fabricate a redirect URL or payment link. Provider errors remain actionable through the shared frontend classifier. The payment modal loads a provider-payment history section when opened and refreshes it after a successful Fawry reference creation, showing only provider, reference, amount, timestamp, and a localized pending/completed/failed status badge. Internal cash/card recording remains a separate workflow and is not included in this provider history. The provider-history endpoint now resolves branch scope from the patient record, uses department-aware appointment checks for department grants, applies the authenticated tenant to invoice, patient, and transaction queries, and excludes soft-deleted invoices. Patient-linked department scopes across patients, appointments, EMR, consent, pharmacy prescriptions, laboratory, radiology, nursing, insurance claims, and billing now use the existing appointment-to-doctor department relationship; no nonexistent `patients.department_id` column is assumed. The voice page currently opens device phone links rather than calling the backend voice endpoints, so it does not claim a provider readiness state it cannot observe.

## Validation results

The modular settings, provider-payment, department-scope, callback-hardening, pharmacy-safety, PostgreSQL integration, RLS-context, Fawry request-boundary, durable backup, durable export, durable report, ETA e-invoicing, and manual InstaPay reconciliation slices were validated successfully. Shared package build passed. Backend and frontend lint checks passed. Backend unit/full tests passed with **41 passed test files, 283 passed tests, 10 skipped test files, and 34 skipped tests**. Frontend tests passed with **13 test files and 49 tests passed**. The billing, authorization, FORCE RLS, authenticated lifecycle, pharmacy, backup, export, reports, ETA, and InstaPay PostgreSQL suites passed with **3, 3, 4, 3, 3, 4, 4, 3, 3, and 4 tests**, respectively. The ETA suite verified configured document-version lookup, real invoice-line and tax mapping, CAdES-BES signature generation, official 202 responses, provider submission and document UUID persistence, asynchronous valid-status polling, callback API-key verification, delivery deduplication, permission separation, and tenant-safe not-found behavior. The reports suite verified pending rather than synchronous completion, branch-scoped row execution, encrypted artifact creation, readable CSV and PDF output, tenant-safe downloads, dedicated download permission enforcement, same-tenant cross-branch rejection, and retention deletion while preserving execution history. The InstaPay suite verified settings-backed readiness, invoice linkage, pending-request idempotency, exact amount matching, atomic invoice and ledger settlement, repeated reconciliation idempotency, rejection without balance changes, legacy callback non-mutation, permission separation, and tenant-safe not-found behavior. `git diff --check` passed. Function 6 implementation is committed in `911102a`; this documentation update is the next commit.

The backend test run still prints existing non-failing warnings about Redis connection attempts in the isolated test environment and the audit test’s intentionally swallowed database-write failure. These warnings did not fail the suite and were not introduced by the modular settings work.

## Rollback and deployment notes

Deploy migrations 053 and 054 before the provider-configuration build, migration 055 before deploying the payment-status build, migration 056 before enabling signed callback finalization, migration 057 before enabling the Fawry provider-reference history field, migration 058 before enabling pharmacy safety and dispensing, migrations 059–060 before enabling durable backup execution, migration 061 before enabling durable export jobs and downloads, migration 062 before enabling durable report execution and downloads, migrations 063–064 before enabling ETA document submission and callback processing, and migrations 065–066 before enabling manual InstaPay reconciliation and the new verification grant. Migrations 055–066 are forward-safe: they add nullable/indexed state, preserve existing history, normalize unsupported legacy backup types to `logical`, and do not delete tenant data, backup execution audit history, export job history, or report execution history during ordinary application rollback. A rollback of application code therefore does not require deleting the new columns or transactions. If the application build must be reverted, the existing legacy clinic settings facade, legacy environment provider fallback, and pre-existing workflows remain available. Configure Stripe webhook secrets and Fawry secure keys per tenant before enabling provider callback delivery; invalid, unsigned, ambiguous, or amount-mismatched callbacks are rejected without changing invoice state.

Before production use, set a strong `ENCRYPTION_KEY` and back up the PostgreSQL database. Existing provider secrets should be rotated through Settings after migration if their provenance is uncertain. Use sandbox environments first, validate provider readiness, and then switch the provider environment to production only after the vendor account is ready. Run `npm run test:billing-integration -w packages/backend`, `npm run test:integration -w packages/backend`, `npm run test:rls-integration -w packages/backend`, and `npm run test:lifecycle-integration -w packages/backend` against dedicated PostgreSQL test databases. These commands apply the repository’s TypeScript migrations through `scripts/run-postgres-integration.ts` before starting Vitest. The production database role must not be granted `BYPASSRLS`. The billing and authorization integration suites use a disposable application-predicate database role, while the RLS suite uses a separate non-BYPASSRLS role that owns its disposable database. The local test database and roles are not part of the repository or production deployment.

## Provider callback references

The Fawry payment-reference request follows the official field and signature contract [1], and its callback implementation follows the official Server-to-Server Notification V2 contract [2]. The callback implementation also follows [Stripe webhook signature verification guidance](https://docs.stripe.com/webhooks) and [Stripe payment webhook handling guidance](https://docs.stripe.com/webhooks/handling-payment-events). Fawry callback normalization follows the [Fawry Server-to-Server Notification V2 contract](https://developer.fawrystaging.com/docs/sdks/payment-notifications/server-notification-v2), including its SHA-256 `messageSignature`, documented amount fields, order statuses, and retry behavior for non-200 responses. The older [Fawry Server-to-Server Notification V1 contract](https://developer.fawrystaging.com/docs/payment-notifications/server-notification-v1) is not silently treated as V2; its MD5 GET signature format requires a separate explicit compatibility implementation.

## Integration test commands

| Command | Scope | Required environment |
|---|---|---|
| `npm run test:billing-integration -w packages/backend` | Real-schema provider-payment history, cross-tenant 404, branch denial, provider-only response, and soft-delete behavior. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `npm run test:integration -w packages/backend` | Real-schema membership, branch isolation, forged-membership rejection, wildcard handling, and direct-denial behavior. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `npm run test:rls-integration -w packages/backend` | FORCE RLS tenant-local reads/writes and request-facade routing through `app.current_tenant`. | Non-BYPASSRLS role with database ownership for the disposable test database; `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `npm run test:lifecycle-integration -w packages/backend` | Authenticated Fastify request lifecycle, tenant-local commit/rollback behavior, CSRF-protected POST routes, and pooled-connection context cleanup. | Non-BYPASSRLS role with database ownership for the disposable test database; `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; optional `CSRF_SECRET`. |
| `npm run test:pharmacy-integration -w packages/backend` | Real-schema pharmacy warning rejection, prescription creation, lot-level dispensing, stock decrement, idempotent retry, and insufficient-stock rollback. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `npm run test:backup-integration -w packages/backend` | Encrypted logical artifact creation, isolated restore verification, JSONB/FK restore behavior, retention deletion, and DR route authorization. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_LOCAL_DIR`, `BACKUP_VERIFY_DB_NAME`, `BACKUP_VERIFY_DB_USER`, `BACKUP_VERIFY_DB_PASSWORD`. The verification database must be separate from `DB_NAME`. |
| `npm run test:export-integration -w packages/backend` | Real encrypted CSV artifact generation, tenant-scoped FHIR R4 mapping, secure download authorization, foreign-tenant rejection, and retention cleanup. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `EXPORT_ENCRYPTION_KEY`, `EXPORT_LOCAL_DIR`, and optionally `EXPORT_STORAGE_LOCATION`. |
| `npm run test:reports-integration -w packages/backend` | Pending report execution, branch-scoped real rows, encrypted CSV/PDF artifacts, secure report downloads, permission separation, tenant rejection, and retention cleanup. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `EXPORT_ENCRYPTION_KEY`, `EXPORT_LOCAL_DIR`, and `REPORT_STORAGE_LOCATION`. |
| `npm run test:eta-integration -w packages/backend` | Tenant-configured ETA document construction, CAdES-BES signing, mocked official token/document-version/submission/status responses, callback API-key verification, callback deduplication, permission separation, and tenant-safe not-found behavior. | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `ENCRYPTION_KEY`; the test generates a short-lived local certificate and does not submit to ETA. |

The integration runner uses a disposable database and applies migrations before the suite. It does not delete unrelated tenant rows; fixtures use unique identifiers and clean up only their own records. The test database should be isolated from development or production data.

Authenticated server requests now start a tenant-local transaction after membership validation. The database facade routes module queries through that transaction, PostgreSQL receives `set_config('app.current_tenant', tenantId, true)`, and the transaction is committed only after a successful response or rolled back on request error. Public routes and third-party provider callbacks do not receive an authenticated tenant transaction. This prevents tenant context from persisting across pooled connections. The lifecycle suite registers test routes after `buildApp()` returns, so it verifies the actual Fastify hook behavior rather than relying only on routes registered during bootstrap. Its protected POST fixtures provide a valid CSRF header/cookie pair; production CSRF exemptions were not expanded for test-only paths.

## Fawry request-boundary notes

The official Fawry reference-number contract requires a merchant code, merchant reference, `PayAtFawry` payment method, customer mobile number, customer email, amount, description, language, charge items, and a SHA-256 signature over the documented canonical string [1]. The adapter sends these fields only to the tenant-configured endpoint, treats the provider response as successful only when it contains a documented success code and a provider reference, and returns safe status codes without exposing secure keys or customer contact details. The callback URL remains a merchant-account configuration concern, while callback verification continues to use the existing V2 implementation [2].

This is a sandbox-ready request boundary, not a fabricated guarantee of a live merchant account. Administrators must enter their own sandbox endpoint and credentials in Settings → Integrations, run the request against the vendor sandbox, and confirm callback delivery and reconciliation before switching the provider to production. The repository does not include vendor credentials and no live external transaction was claimed or performed during this implementation slice.

## Function 1 completed: pharmacy clinical safety and transactional dispensing

Function 1 is complete and committed as an additive, tenant-safe pharmacy workflow. Prescription creation now uses the dedicated `pharmacy.prescribe` permission, validates the patient and prescription item schema, checks recorded patient allergies, active duplicate therapy, medication-reference interactions, and clinic medication/catalog presence, and returns a structured clinical warning before persistence when an authorized override is required. Clinical overrides require a documented reason and the `pharmacy.override` permission.

Dispensing now uses the dedicated `pharmacy.dispense` permission and requires an idempotency key. A single database transaction locks the prescription, prescription items, and selected inventory lot; rejects cancelled, expired, unavailable, or insufficient stock; decrements stock without allowing negative quantities; records the exact inventory lot, batch, expiry, price, quantity, patient, prescription, and dispensing user; updates partial or complete statuses; and returns the same completed result for a repeated idempotency key. A failed dispense rolls back the request row, inventory change, prescription update, and dispense history together.

The advanced pharmacy interaction screen no longer uses a hardcoded common-drug or interaction list. It loads the medication reference from the backend and requests pairwise interaction analysis from the authenticated pharmacy endpoint. Migration `058_pharmacy_safety.ts` adds forward-safe idempotent dispense requests, lot-level dispense records, the prescription override-audit field, and the explicit clinician/pharmacy permission-template updates. Existing custom tenant roles are not rewritten; administrators must explicitly grant the new permissions to custom roles.

Function 1 is a deterministic baseline safety layer over the clinic’s recorded data and medication reference. It is not represented as a substitute for a licensed drug-interaction or dose-management service; where the clinic reference is incomplete, the workflow produces a warning or blocks dispensing rather than inventing clinical facts.

Validation completed: shared build passed; backend and frontend type checks passed; backend unit suite passed with **40 test files and 279 tests**, with **5 files and 16 tests skipped**; frontend suite passed with **13 files and 49 tests**; pharmacy integration passed with **3 tests**; billing integration passed with **3 tests**; authorization integration passed with **3 tests**; FORCE RLS integration passed with **4 tests**; authenticated Fastify lifecycle integration passed with **3 tests**; and `git diff --check` passed.

## Function 2 completed: durable backup, restore, and recovery verification

Function 2 is complete and committed as an additive, tenant-safe disaster-recovery workflow. A backup is now a tenant-scoped logical snapshot rather than a simulated timer result. The worker collects configured tenant tables in foreign-key dependency order, normalizes JSONB values for portable restoration, encrypts the snapshot with AES-256-GCM, stores it at a protected local or MinIO/S3 location, records checksum/size/row-count metadata, and returns `pending` until durable processing completes. Storage paths are constrained to configured roots and path traversal is rejected.

The worker is an idempotent in-process background service for the current single-process deployment model. It processes pending jobs, recovers stale processing rows, applies cron configuration, and deletes expired artifacts while retaining execution audit rows. Production startup and shutdown explicitly start and stop the worker; test modes do not start it. Administrators configure retention, storage location, excluded tables, and schedule values through the DR settings routes. Module activation and backup configuration do not grant staff permissions.

Restore verification requires `BACKUP_VERIFY_DB_NAME` and separate restore credentials. The service refuses to use the application database as its verification target, restores into the separately migrated database, computes target-schema foreign-key ordering, records a verification row, and exposes only safe status, checksum, row-count, and error metadata. The administrator must treat the verification database as isolated and disposable; this is a recovery drill, not an in-place production restore.

The implementation uses the existing tenant authorization model: `dr_backup.view` reads audit/configuration data, `dr_backup.create` queues backups, `dr_backup.edit` changes backup and DR configuration, and `dr_backup.verify` runs restore drills. Legacy `full` and `incremental` configuration values are normalized by migration 060 to the only supported implementation type, `logical`; rollback does not pretend to restore unsupported simulated semantics.

Before production use, set a strong `BACKUP_ENCRYPTION_KEY` distinct from ordinary application secrets, configure a durable MinIO/S3 location or protected local path, provision an isolated verification database, run a restore drill, and monitor the execution and verification status endpoints. The local path is appropriate for development or a single host; production installations should use durable object storage with restricted credentials and an independent retention/backup policy.

## Function 3 completed: durable data export, secure downloads, and FHIR R4 mapping

Function 3 is complete and committed as an additive, tenant-safe export workflow. Export creation now validates the supported module, CSV/JSON/FHIR JSON format, declared columns, date and patient filters, deleted-record policy, retention, and optional saved definition. Jobs remain `pending` until the durable worker claims and processes them. The worker reads real tenant rows through explicit table and column policies, measures the generated output, encrypts the artifact with AES-256-GCM, stores it under a protected local or MinIO/S3 location, records checksum, encrypted size, MIME type, filename, retention expiry, and completion state, and deletes partial artifacts when processing fails.

The download route no longer returns a synthetic path or URL. It requires the dedicated `data_export.download` permission, looks up the job using both job ID and authenticated tenant ID, rejects incomplete or expired artifacts, verifies the stored checksum, authenticates/decrypts the artifact, and streams the bytes with a safe attachment filename. Download and FHIR access are audited. Artifact retention removes the stored object while preserving the export job audit row. The export worker starts and stops with the production process and remains disabled in lifecycle test mode.

FHIR output is a real R4 `Bundle` mapped from tenant-scoped records. The implementation covers `Patient`, `Organization`, `Practitioner`, `Appointment`, `Encounter`, `Observation` from recorded vitals and laboratory results, `MedicationRequest`, `MedicationDispense` from pharmacy prescriptions and dispense records, `DiagnosticReport` from laboratory and radiology orders, `Invoice`, and `PaymentReconciliation`. Unsupported fields are omitted rather than fabricated. The FHIR route does not accept a tenant selector; the authenticated tenant is authoritative, and optional patient/date filters remain tenant-bound.

Sensitive-field handling is explicit in the export module catalog. Generic exports use allowlisted columns rather than `SELECT *`, exclude credentials and unrelated secret fields, and require `data_export.manage` for deleted-record exports. Existing `data_export.export` run access remains distinct from `data_export.download`; accountant and reporting roles receive the new download grant, while custom roles are not rewritten automatically.

Before production use, set a strong `EXPORT_ENCRYPTION_KEY` distinct from ordinary application secrets, configure a durable MinIO/S3 location or protected local path, choose retention appropriate to the clinic’s policy, and verify that authorized users can download a real artifact while unauthorized users receive a denial or tenant-safe not-found response. FHIR output should be validated by the receiving system before being used for interoperability or continuity-of-care exchange.

## Function 4 completed: real report execution and report-file download

Function 4 is complete and committed as an additive report execution workflow. Report definitions now declare a supported real source such as patients, appointments, EMR, billing, laboratory, radiology, pharmacy, inventory, or HR. The backend rejects unsupported query sources, unsupported selected fields, invalid filters, invalid sorting, and output formats not enabled by the definition. Reports are executed only through allowlisted columns and explicit source mappings; arbitrary SQL and caller-supplied table names are never accepted.

Execution now creates a `pending` row and snapshots the effective report scope, assigned branches, department, and creating user. The durable worker claims pending executions idempotently, applies tenant, branch, department, and assigned-patient policies through the existing authorization scope layer, applies validated date and field filters, enforces a configurable maximum row count, and renders actual CSV, PDF, Excel-compatible SpreadsheetML, or JSON output. A report cannot become `completed` until the readable output has been generated, encrypted, stored, and its checksum and file metadata have been recorded.

The report download route requires the dedicated `reports.download` permission, rechecks tenant ownership and the current authorized report scope, rejects incomplete or expired files, verifies the encrypted checksum, decrypts the artifact, and streams the bytes with a safe attachment filename. Retention removes the artifact while preserving execution history. The report worker is started and stopped with the production process and remains disabled during lifecycle tests. Existing PDF generation now uses the installed pdfmake API correctly under the ESM backend runtime.

The frontend now loads the supported report sources dynamically, requires a real source when creating a definition, queues execution rather than claiming immediate completion, displays pending/processing/completed/failed states, and downloads the actual file through the authenticated API client. Existing report-management and report-export grants remain scope-specific; explicit built-in report-export roles also receive the separate `reports.download` grant, while custom roles are not rewritten automatically.

Before production use, configure `REPORT_STORAGE_LOCATION` to a protected durable local or MinIO/S3 location, set a strong `EXPORT_ENCRYPTION_KEY` or an equivalent configured encryption key, choose retention appropriate to the clinic’s policy, and verify a branch- or department-scoped report with both an authorized and unauthorized account. Do not expose report artifacts through public URLs or direct filesystem paths.

## Function 5 completed: real ETA e-invoicing submission and configurable tax/document rules

Function 5 is complete and committed as a tenant-configured Egyptian Tax Authority adapter. The implementation uses the official OAuth 2.0 client-credentials flow at the configured identity service [6], retrieves the configured published invoice document-type version [7], and builds an ETA Invoice v1.0 document from persisted clinic invoice lines, patient data, tenant/provider settings, issuer branch, activity code, currency, tax type, tax rate, and tax-calculation mode [13]. It rejects incomplete configuration rather than inserting Egypt-specific defaults.

Before submission, the adapter applies ETA’s documented canonical JSON serialization and SHA-256 hash process [12], signs the hash through CAdES-BES using the tenant’s configured certificate and private key [11], and embeds the issuer signature. The backend image includes OpenSSL for this server-side operation; certificate/private-key material remains encrypted at rest and never reaches the frontend. A plain legacy signing string is not treated as a valid signature.

Submission uses the configured ETA system API endpoint and records the request hash, document hash, internal ID, document type/version, submission UUID, ETA document UUID, long ID, provider response, HTTP status, attempts, and retry state. The adapter handles asynchronous `202` submissions, duplicate-submission responses, bounded retry scheduling, status polling, validation/rejection/cancellation normalization, and immutable audit events. It does not mark an invoice accepted before ETA returns a valid document status [8] [9].

The callback route verifies the tenant’s encrypted notification API key by hash, accepts only the documented document-notification shape, deduplicates delivery IDs, updates the correlated internal ETA document, and returns an idempotent success response [10]. Tenant and permission boundaries remain authoritative: `eta_invoicing.create` generates drafts, `eta_invoicing.manage` submits, `eta_invoicing.view` reads/refreshes status, and provider callback delivery is authenticated separately. The worker is started and stopped with the production process and remains disabled in test-only lifecycle execution.

Administrators configure ETA from **Settings → Integrations**. The required nonsecret fields are the tax registration number, invoice series, activity code, identity endpoint URL, system API endpoint URL, document type ID, document type version ID, issuer branch code, currency code, tax type code, tax rate, and tax calculation mode. Required secrets are client ID, client secret, signing certificate, and signing private key; the callback API key and private-key passphrase are optional. Use the official PreProd endpoints and trusted test root certificate for sandbox testing [5], and do not disable TLS verification in application code. The official contract requires a real taxpayer certificate and provider credentials; repository tests use a local signed test certificate and mocked provider responses, not live tax submissions.

Function 5 validation passed with **3 focused unit tests**, **3 ETA PostgreSQL integration tests**, the complete backend/frontend unit suites, all prior billing, authorization, FORCE RLS, lifecycle, pharmacy, backup, data-export, and reports PostgreSQL suites, shared build, backend/frontend type checks, and `git diff --check`. The implementation commit is `471c8ae`.

## Function 6 completed: manual InstaPay transfer and controlled reconciliation

Function 6 is complete as a deliberately manual payment workflow. Health-ERP no longer presents InstaPay as an integrated online payment rail: there is no trusted provider callback, no fabricated completion state, and no process-wide wallet fallback. Administrators configure the structural-only **InstaPay manual transfer instructions** profile from **Settings → Integrations** with the clinic wallet/account destination, account name, tenant reference prefix, and instructions. The workflow uses the configured clinic currency and fails closed when the profile or currency is incomplete.

A staff member with `billing.create` can create an invoice-linked transfer request. The application generates a tenant-unique local reference, stores a pending `payment_transactions` ledger row, snapshots the destination and instructions, and returns `awaiting_transfer`. The local reference is only a reconciliation aid; it is never treated as proof that money was received. A second request for the same invoice and amount returns the existing pending request rather than creating a duplicate ledger entry.

A staff member with the new `billing.verify` permission can reconcile or reject the request after checking the clinic’s bank or wallet statement. Reconciliation requires an external statement reference, exact received amount, transfer date, and decision notes. PostgreSQL row locks update the reconciliation record, payment ledger, and invoice paid/due/status fields atomically. Overpayments and amount mismatches are rejected. Repeated reconciliation is idempotent and cannot increase invoice paid balance twice. Rejection records the reason, marks the pending ledger row failed, and leaves invoice balances unchanged. Statement references are unique per tenant. Existing custom tenant roles are not rewritten; seeded billing manager, billing officer, and accountant templates receive the verification grant through migration 066.

The legacy `/api/v1/payments/instapay/callback` endpoint is retained only as a safe compatibility boundary and returns HTTP 409 without changing any transaction. Manual reconciliation history is separate from external-provider payment history, while tenant, branch, department, assigned-patient, RBAC, and audit controls remain mandatory at the backend. The Billing interface is bilingual and visibly distinguishes manual instructions, pending verification, reconciled, and rejected states from Stripe/Fawry provider actions and internal cash/card recording.

Function 6 validation passed with **15 focused provider-configuration/adapter contract tests**, **4 InstaPay PostgreSQL integration tests**, **41 backend test files with 283 tests passed**, **13 frontend test files with 49 tests passed**, backend/frontend type checks, shared build, existing billing provider-history tests, and `git diff --check`. The implementation commit is `911102a`.

## Next recommended implementation slice

The next incomplete function is **Function 7: durable automation action execution and event/cron processing**. It must be implemented only after Function 6 remains committed and pushed, with allowlisted tenant-aware action handlers, durable event/outbox or scheduled-job state, atomic cooldown/max-execution enforcement, idempotent retries, per-step results, and explicit failure states.

## References

[1]: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis "FawryPay: Create Payment Requests Using FawryPay Reference Number"
[2]: https://developer.fawrystaging.com/docs/sdks/payment-notifications/server-notification-v2 "FawryPay: Server-to-Server Notification V2"
[3]: https://docs.stripe.com/api/checkout/sessions "Stripe API: Checkout Sessions"
[4]: https://docs.stripe.com/webhooks "Stripe: Webhooks"
[5]: https://sdk.invoicing.eta.gov.eg/faq/ "Egyptian Tax Authority eInvoicing SDK: Frequently Asked Questions"
[6]: https://sdk.invoicing.eta.gov.eg/api/01-login-as-taxpayer-system/ "Egyptian Tax Authority eInvoicing SDK: Login as Taxpayer System"
[7]: https://sdk.invoicing.eta.gov.eg/api/04-get-document-type-version/ "Egyptian Tax Authority eInvoicing SDK: Get Document Type Version"
[8]: https://sdk.invoicing.eta.gov.eg/einvoicingapi/01-submit-documents/ "Egyptian Tax Authority eInvoicing SDK: Submit Documents"
[9]: https://sdk.invoicing.eta.gov.eg/einvoicingapi/09-get-submission/ "Egyptian Tax Authority eInvoicing SDK: Get Submission"
[10]: https://sdk.invoicing.eta.gov.eg/einvoicingapi/14-receive-document-notifications/ "Egyptian Tax Authority eInvoicing SDK: Receive Document Notifications"
[11]: https://sdk.invoicing.eta.gov.eg/signature-creation/ "Egyptian Tax Authority eInvoicing SDK: Document Signature Creation"
[12]: https://sdk.invoicing.eta.gov.eg/document-serialization-approach/ "Egyptian Tax Authority eInvoicing SDK: Document Serialization Approach"
[13]: https://sdk.invoicing.eta.gov.eg/documents/invoice-v1-0/ "Egyptian Tax Authority eInvoicing SDK: Invoice v1.0"
