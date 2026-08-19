# Function 8 provider sandbox audit notes

**Audit date:** 19 August 2026  
**Scope:** Verified Stripe/provider sandbox end-to-end testing and remaining provider adapters.

## Current baseline

The repository has tenant-scoped provider connections, encrypted active secrets, sandbox/production environment selection, structural validation, optional generic endpoint probing, provider capability contracts, and hardened Fawry/Stripe callback boundaries. The settings test action currently proves configuration/readiness and, when explicitly enabled, reaches one configured endpoint. It does not prove provider authentication, a provider account, a usable sandbox operation, callback delivery, or payment reconciliation.

| Provider | Current structural boundary | Current operational boundary | Function 8 gap |
|---|---|---|---|
| Stripe | Requires only `secretKey`. The provider contract marks vendor authentication as `not_verified` and business operation as `not_implemented`, although runtime operation keys are registered. | Checkout session creation uses the Stripe SDK and tenant runtime/fallback credentials. It validates invoice ownership, amount ceiling, metadata, and stores a pending transaction. Webhook confirmation verifies the raw-body signature, retrieves the session, checks `paid`, tenant/invoice metadata, exact amount, row locks, and idempotent invoice settlement. | No provider-account authentication result, no sandbox-key/environment consistency check, no durable verification evidence, no return-state reconciliation endpoint, no idempotency key for checkout creation, and no dedicated sandbox test proving the full mocked checkout-to-webhook lifecycle. The frontend success/cancel URL is only a query-string navigation and does not itself verify payment.
| Fawry | Requires merchant fields, provider currency/language, endpoint, and secure key. The adapter builds a signed request and the provider operation returns a pending reference. | Tenant-configured signed payment-reference creation and Server-to-Server V2 callback verification are implemented. Callback checks signature, tenant/provider/reference binding, required amount fields, exact amount, and idempotent finalization. | Provider contract still declares business operation unsupported. Generic live validation only probes an endpoint and never proves Fawry authentication or callback delivery. A controlled sandbox verification record and explicit provider-specific evidence are missing.
| Twilio | Requires account SID, auth token, and one sender/messaging-service secret. | Existing SMS/voice paths consume tenant runtime credentials and preserve phone/WhatsApp/voice links. | Provider contract still declares vendor authentication and business operations unverified/unsupported. There is no account-authentication check such as a tenant-scoped account fetch, no safe sandbox test result, and no provider-specific status evidence.
| ETA | Structural validation requires taxpayer/document/signing configuration; the real adapter implements OAuth, document-version lookup, signing, submission, status, and callbacks. | ETA submission, polling, and callback idempotency are implemented and tested with mocked provider responses. | Vendor authentication is still reported as `not_verified`; there is no explicit provider-authentication/sandbox verification record separate from document submission.
| InstaPay manual | Structural-only by design with no external operation. | Manual instructions and staff reconciliation are complete. | Must remain manual-only and must not be changed into a fake provider verification path.

## Required Function 8 outcome

Function 8 should add a provider-specific **sandbox verification boundary**, not a generic green light. The route must be authenticated for tenant administrators, require a configured sandbox environment, use only the tenant’s encrypted runtime credentials, and return a durable verification ID/status with provider, environment, verification type, safe result code, timestamps, and sanitized evidence. The response must never include credentials, raw provider payloads, payment data, or arbitrary provider headers.

Stripe requires the strongest end-to-end proof in this slice. A verification test should confirm that a sandbox/test secret authenticates to the expected Stripe account or balance API, that checkout creation carries tenant/invoice metadata and an idempotency key, that a mocked/test-mode session can be returned and reconciled through the existing confirmation service, and that duplicate webhook delivery finalizes the invoice once. A user returning to the billing page must be able to refresh authoritative invoice/payment state through the backend rather than trusting `payment=success` in the URL.

For Fawry, the safe boundary is a provider-specific sandbox request/readiness test that uses the configured sandbox endpoint and real signed request construction only when the administrator explicitly initiates it with a real invoice/customer fixture or a provider-supported non-settling validation endpoint. The system must not silently create a payment reference during a Settings test. Callback delivery remains an operational verification step and must be represented as not verified until the clinic receives and validates a real callback or executes a controlled test fixture.

For Twilio, the provider-specific check should authenticate the configured account using the tenant’s SID/token and record safe account metadata only. It must not send an SMS or place a voice call from the Settings test. Actual message/call delivery must remain an explicit operational action with tenant-scoped credentials and a separate result.

For ETA, add an explicit OAuth/authentication verification result using the configured identity endpoint and client credentials, without claiming a document was accepted. Existing ETA document submission/status/callback tests remain separate. Manual InstaPay must remain structural-only and excluded from this verification route.

## Safety and compatibility constraints

The implementation must preserve the current tenant, branch, department, assigned-patient, RBAC, callback-signature, amount-matching, and FORCE RLS controls. Provider verification must be opt-in, bounded by the existing timeout, blocked for production credentials when the requested test mode is sandbox, and blocked from localhost/private endpoint probing. It must be idempotent by a tenant/provider/environment/verification-key combination and retain an audit trail even when provider verification fails.

A provider’s structural readiness must not be upgraded to verified authentication merely because a generic endpoint returned HTTP 200. The provider contract should distinguish `vendor_authentication` and `business_operation` states, and the frontend should display **configured**, **sandbox authentication verified**, **operation tested**, **callback not verified**, and **unsupported/manual** as separate states.

## Existing focused evidence

`payment-callback-routes.test.ts` currently proves Fawry signature/amount/idempotency behavior and Stripe raw-body signature plus delegated confirmation, but it does not execute a full mocked Stripe lifecycle or test return-state refresh. `clinic-provider-live-validation.test.ts` proves safe generic endpoint probing only. `clinic-provider-runtime.ts` is the authoritative backend-only tenant secret loader and must remain the only credential path for provider verification and operational calls.

## Planned implementation slices

1. Add additive durable provider-verification evidence and idempotency state.
2. Add provider-specific verification adapters for Stripe account authentication, Twilio account authentication, and ETA OAuth authentication; keep Fawry operation/callback verification explicit and non-silent.
3. Add tenant-admin verification routes with safe status retrieval and Stripe payment-state refresh.
4. Add Stripe checkout idempotency and authoritative return-state handling without trusting URL query parameters.
5. Add focused unit, route, and PostgreSQL sandbox tests using mocked provider SDK/HTTP responses and no external transaction.
6. Add bilingual Settings/Billing evidence display, update the administrator guide, commit, and push before Function 9.

Function 8 must not claim a real clinic vendor account is live unless the administrator runs the verification against the clinic’s own sandbox credentials and observes the provider-specific evidence and callback/operation result.
