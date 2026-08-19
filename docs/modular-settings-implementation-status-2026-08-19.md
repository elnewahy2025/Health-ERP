# Modular Clinic Settings Implementation Status

**Project:** Health-ERP Clinic Management System  
**Status date:** 19 August 2026  
**Repository branch:** `main`  
**Latest implementation commit:** `e55c5e9`

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

## Database and security model

Migrations `053_modular_clinic_settings.ts`, `054_provider_live_validation_policy.ts`, `055_payment_provider_status.ts`, `056_payment_callback_hardening.ts`, and `057_provider_reference.ts` create or extend the following structures with `hasTable` and `hasColumn` guards. PostgreSQL integration tests apply the same TypeScript migrations through the dedicated `tsx` runner before Vitest starts:

| Table or extension | Purpose |
|---|---|
| `tenant_regional_profiles` | Tenant country, regional profile key, national identifier policy, phone policy, tax profile key, status, version, and metadata. |
| `tenant_module_configurations` | Nonsecret module-specific configuration such as ETA configuration, validation status, errors, schema version, and optimistic version. |
| `tenant_provider_connections` | Tenant-wide provider connection metadata: provider, environment, status, nonsecret configuration, validation status, and error metadata. |
| `clinic_integration_secrets` extensions | Connection linkage, secret version, active state, rotation metadata, expiry, and last-used metadata. Existing encrypted secrets are preserved. |
| `audit_logs` extensions | Module, provider, scope, and request context fields for future audit correlation. |
| `payment_transactions` extension | Migration 055 adds nullable `provider_key`, indexes it, and backfills existing Fawry and Stripe rows. Migration 056 adds nullable `updated_at` with a created-time backfill and a tenant/provider/merchant-reference lookup index. Migration 057 adds nullable `provider_reference` for the external reference returned by a provider. Internal cash/card transactions remain `NULL`. |

Existing tenants receive an incomplete generic regional profile. Existing integration secrets are linked to tenant provider connection records when possible. The migration `down()` function does not delete tenant configuration, provider links, secrets, or audit history.

Secret values follow this path: administrator input → server-side encryption → encrypted database value. API responses include only `configured`, `lastFour`, version, rotation, and expiry metadata. The backend-only runtime resolver is not imported by frontend code or HTTP response mappers.

## Supported provider catalog

The current catalog is intentionally explicit rather than seeded with fake clinic data.

| Provider | Tenant configuration | Secret metadata | Regional rule |
|---|---|---|---|
| ETA | Stored under module key `eta` in `tenant_module_configurations` | Client ID, client secret, signing key | Requires country code `EG` for readiness. |
| Fawry | Merchant code, merchant-reference prefix, provider `currencyCode`, provider language, payment endpoint URL, and optional validation endpoint URL | Secure key and hash key | Requires country code `EG` for readiness. The payment endpoint, language, and currency are administrator-configured; `EGP` is not inserted as a clinic default. |
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
| GET | `/api/v1/invoices/:invoiceId/provider-payments` | `billing.view` | Returns tenant-scoped external payment history with only `id`, `providerKey`, `status`, `amount`, `reference`, `createdAt`, and `updatedAt`. |
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

WhatsApp remains on its existing separate Meta provider configuration path because it is not represented by the Twilio provider catalog in this foundation. Vendor-specific ETA invoice submission and true provider network handshakes should be implemented as separate adapters once their exact API contracts, endpoints, certificate requirements, and test environments are supplied.

## Live-validation controls

Migration 054 adds `validation_mode`, `live_validation_enabled`, and `validation_timeout_ms` to each tenant provider connection. Existing connections default to structural validation, live validation disabled, and a five-second timeout. Administrators can select **Configuration only** or **Live validation**, explicitly enable live validation, and set a bounded timeout between one and thirty seconds. Provider endpoint URLs are stored as nonsecret configuration fields; they are never allowed to contain embedded credentials.

Live validation is intentionally opt-in. Production endpoints must use HTTPS. Localhost, link-local, private IPv4 ranges, loopback, and private IPv6 ranges are blocked to prevent an administrator mistake from turning the application into an internal-network request proxy. Live probes send only a simple GET request with generic `Accept` headers and never send provider secrets, authentication headers, payment data, or clinic records. Redirects are rejected, responses are not parsed as trusted provider payloads, and timeout or HTTP failures are mapped to safe status codes.

## Versioned provider contracts

The provider API now returns a versioned contract for every supported provider. Capability states explicitly distinguish **implemented** structural validation and endpoint reachability from **not verified** vendor authentication and **not implemented** business operations. This prevents a green configuration check from being interpreted as proof that a vendor account, signing certificate, payment rail, tax submission workflow, or messaging account is operational.

The Settings page displays these capability states and the contract version for administrators. Unknown provider keys return a safe unsupported result rather than falling through to an inferred or unregistered adapter.

## Provider adapter validation semantics

The provider test endpoint now delegates to a provider adapter registry. Structural checks always run first. If the saved policy is `live` and `live_validation_enabled` is true, the adapter then performs only the configured endpoint reachability probe. Structural results record a safe code, readiness status, missing field names, and `testMode: structural`; live results record a safe endpoint status and `testMode: live`. Neither result includes decrypted secret values.

This is deliberately not presented as a fabricated vendor handshake. The current live probe sends no provider credentials and does not claim that ETA, Fawry, Stripe, or Twilio authentication or business APIs are valid. Vendor-specific handshakes remain a separate adapter step requiring the exact vendor endpoint, signing algorithm, certificate requirements, timeout, retry, and response-sanitization contract. Decryption failures are returned as a generic safe invalid result. Twilio accepts one configured sender option for voice or messaging while preserving optional legacy secret fields, Fawry requires administrator-entered `currencyCode`, `language`, and `paymentEndpointUrl` values; it does not insert `EGP`, a language, or a vendor URL as a clinic default.

## Provider-operation guards

Provider operation call sites now use the registered capability contract before executing. Fawry creation and callback verification, Stripe checkout and confirmation, Twilio SMS, outbound voice, conference calls, and voice callback verification are registered as supported runtime operations. ETA invoice QR generation remains a local clinic operation, but ETA invoice submission is not registered as a vendor operation and now returns HTTP 409 with `PROVIDER_OPERATION_NOT_SUPPORTED` instead of generating a fake approval UUID.

These guards do not replace RBAC. Existing route permissions remain mandatory: billing permissions protect payments, `voice_calls.create` protects voice creation, `eta_invoicing.manage` protects ETA submission, and settings permissions protect provider configuration. The guard is an additional provider-contract boundary, not a frontend-only gate.

## Operational provider UX

The ETA invoicing page now distinguishes an unsupported ETA submission contract from ordinary submission failures and keeps the guidance visible after the toast disappears. The communications test-send page shows Twilio setup guidance when an SMS template cannot be delivered, while email templates retain their existing generic failure behavior. Both flows preserve their existing backend authorization and do not attempt to bypass provider capability guards.

The billing page now exposes separate permission-gated Stripe checkout and Fawry payment-reference actions alongside the existing internal Record Payment action. Stripe receives the tenant-configured clinic currency only when available and otherwise lets the backend resolve it from clinic configuration. Fawry requires entered patient name, phone, and email fields, reports the provider-created pending reference, and does not fabricate a redirect URL or payment link. Provider errors remain actionable through the shared frontend classifier. The payment modal loads a provider-payment history section when opened and refreshes it after a successful Fawry reference creation, showing only provider, reference, amount, timestamp, and a localized pending/completed/failed status badge. Internal cash/card recording remains a separate workflow and is not included in this provider history. The provider-history endpoint now resolves branch scope from the patient record, uses department-aware appointment checks for department grants, applies the authenticated tenant to invoice, patient, and transaction queries, and excludes soft-deleted invoices. Patient-linked department scopes across patients, appointments, EMR, consent, pharmacy prescriptions, laboratory, radiology, nursing, insurance claims, and billing now use the existing appointment-to-doctor department relationship; no nonexistent `patients.department_id` column is assumed. The voice page currently opens device phone links rather than calling the backend voice endpoints, so it does not claim a provider readiness state it cannot observe.

## Validation results

The provider-payment, department-scope, callback-hardening, PostgreSQL integration, RLS-context, and Fawry request-boundary slices were validated successfully. Shared package build passed. Backend and frontend lint checks passed. Backend unit/full tests passed with **39 passed test files, 275 passed tests, 4 skipped test files, and 13 skipped tests**. Frontend tests passed with **13 test files and 49 tests passed**. The real migration-backed billing integration suite passed with **1 test file and 3 tests**. The real authorization integration suite passed with **1 test file and 3 tests**. The real non-BYPASSRLS FORCE RLS suite passed with **1 test file and 4 tests**, covering tenant-local reads, no-context isolation, request-facade transaction routing, and cross-tenant write rejection. The authenticated Fastify FORCE RLS lifecycle suite passed with **1 test file and 3 tests**, covering membership authentication and tenant-scoped patient access, successful write commit plus failed-write rollback, and pooled-connection cleanup. The lifecycle suite also passed with an explicit configured CSRF secret, confirming that protected POST routes remain covered without weakening CSRF validation. Provider adapter contract tests passed with **4 provider-focused test files and 21 tests**, covering derived validation/runtime/callback operation metadata, explicit unsupported ETA operations, unknown-provider safety, preservation of structural adapter behavior, the official Fawry signature formula, safe provider response normalization, endpoint rejection, and authenticated create-route persistence. Callback-specific executable tests cover valid and invalid Fawry signatures, amount mismatch rejection, idempotent repeated Fawry callbacks, invalid Stripe signatures, verified Stripe completion events, and nonsecret provider history. The billing, authorization, FORCE RLS, and authenticated lifecycle PostgreSQL suites passed with **3, 3, 4, and 3 tests**, respectively. `git diff --check` passed. The implementation is committed in `e55c5e9`; this documentation update is the next commit.

The backend test run still prints existing non-failing warnings about Redis connection attempts in the isolated test environment and the audit test’s intentionally swallowed database-write failure. These warnings did not fail the suite and were not introduced by the modular settings work.

## Rollback and deployment notes

Deploy migrations 053 and 054 before the provider-configuration build, migration 055 before deploying the payment-status build, migration 056 before enabling signed callback finalization, and migration 057 before enabling the Fawry provider-reference history field. Migrations 055, 056, and 057 are forward-safe: they add nullable/indexed state, backfill only safe historical values, and their `down()` paths do not drop columns or delete payment history. A rollback of application code therefore does not require deleting the new columns or transactions. If the application build must be reverted, the existing legacy clinic settings facade, legacy environment provider fallback, and pre-existing workflows remain available. Configure Stripe webhook secrets and Fawry secure keys per tenant before enabling provider callback delivery; invalid, unsigned, ambiguous, or amount-mismatched callbacks are rejected without changing invoice state.

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

The integration runner uses a disposable database and applies migrations before the suite. It does not delete unrelated tenant rows; fixtures use unique identifiers and clean up only their own records. The test database should be isolated from development or production data.

Authenticated server requests now start a tenant-local transaction after membership validation. The database facade routes module queries through that transaction, PostgreSQL receives `set_config('app.current_tenant', tenantId, true)`, and the transaction is committed only after a successful response or rolled back on request error. Public routes and third-party provider callbacks do not receive an authenticated tenant transaction. This prevents tenant context from persisting across pooled connections. The lifecycle suite registers test routes after `buildApp()` returns, so it verifies the actual Fastify hook behavior rather than relying only on routes registered during bootstrap. Its protected POST fixtures provide a valid CSRF header/cookie pair; production CSRF exemptions were not expanded for test-only paths.

## Fawry request-boundary notes

The official Fawry reference-number contract requires a merchant code, merchant reference, `PayAtFawry` payment method, customer mobile number, customer email, amount, description, language, charge items, and a SHA-256 signature over the documented canonical string [1]. The adapter sends these fields only to the tenant-configured endpoint, treats the provider response as successful only when it contains a documented success code and a provider reference, and returns safe status codes without exposing secure keys or customer contact details. The callback URL remains a merchant-account configuration concern, while callback verification continues to use the existing V2 implementation [2].

This is a sandbox-ready request boundary, not a fabricated guarantee of a live merchant account. Administrators must enter their own sandbox endpoint and credentials in Settings → Integrations, run the request against the vendor sandbox, and confirm callback delivery and reconciliation before switching the provider to production. The repository does not include vendor credentials and no live external transaction was claimed or performed during this implementation slice.

## Next recommended implementation slice

The next production-hardening slice should add the Stripe Checkout Session adapter boundary and sandbox verification, then add vendor-specific authentication and business-operation adapters for ETA and Twilio. Each adapter should define its own request signing, endpoint configuration, timeout policy, retry behavior, certificate handling, idempotency, and response sanitization. That work must be done without placing vendor secrets in frontend code or reintroducing country-specific defaults into the generic clinic core.

## References

[1]: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis "FawryPay: Create Payment Requests Using FawryPay Reference Number"
[2]: https://developer.fawrystaging.com/docs/sdks/payment-notifications/server-notification-v2 "FawryPay: Server-to-Server Notification V2"
[3]: https://docs.stripe.com/api/checkout/sessions "Stripe API: Checkout Sessions"
[4]: https://docs.stripe.com/webhooks "Stripe: Webhooks"
