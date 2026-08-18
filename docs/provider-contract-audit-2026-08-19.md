# Provider Contract Audit

**Date:** 19 August 2026  
**Repository:** Health-ERP Clinic Management System  
**Scope:** ETA, Fawry, Stripe, and Twilio provider configuration and runtime behavior.

## Verified current behavior

The provider registry currently supports four tenant-scoped provider keys: `eta`, `fawry`, `stripe`, and `twilio`. All provider secrets are resolved through the backend-only runtime resolver and are never returned to the Settings API. The provider test endpoint performs structural validation first and may perform an opt-in endpoint reachability probe when the tenant explicitly enables live validation.

| Provider | Existing operational consumers | Structural checks | Current live behavior | Vendor business handshake |
|---|---|---|---|---|
| ETA | Configuration model and module configuration storage; no verified backend submission consumer was found in the audited runtime paths. | Tax registration number, invoice series, activity code, client ID, client secret, signing key. | Optional secret-free endpoint reachability probe. | **Not implemented in this slice.** Exact ETA API contract, authentication, signing, certificate, and submission workflow must be supplied and implemented separately. |
| Fawry | Payment creation and callback signature paths consume tenant-scoped provider runtime values. | Merchant code, reference prefix, three-letter currency code, secure key. | Optional secret-free endpoint reachability probe. | **Not implemented in this slice.** The probe does not authenticate or create a payment. |
| Stripe | Checkout creation and confirmation paths consume tenant-scoped provider runtime values. | Secret key; optional currency and webhook metadata remain nonsecret configuration. | Optional secret-free endpoint reachability probe. | **Not implemented in this slice.** The probe does not call Stripe authentication or payment APIs. |
| Twilio | SMS, voice, conference, and callback signature paths consume tenant-scoped provider runtime values. | Account SID, auth token, and at least one sender/service secret. | Optional secret-free endpoint reachability probe. | **Not implemented in this slice.** The probe does not authenticate against Twilio or send a message/call. |

## Safe capability boundary

The next implementation must use a versioned contract registry rather than infer vendor behavior from a URL or provider name. Each provider capability should explicitly state whether it is structural-only, endpoint-reachability, authentication, or business-operation capable. Unsupported capabilities must return a safe, auditable result instead of pretending that configuration validation is a successful vendor handshake.

No vendor endpoint, signing algorithm, certificate workflow, retry policy, or response schema was invented during this audit. A real ETA submission adapter, Fawry authenticated test, Stripe authenticated test, or Twilio authenticated test should be added only after its exact contract is known and tested with a vendor-approved sandbox account.
