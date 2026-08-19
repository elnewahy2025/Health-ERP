# Function 8 provider sandbox design

**Implementation slice:** Verified Stripe/provider sandbox end-to-end testing and remaining provider adapters.  
**Design date:** 19 August 2026.

## Product boundary

Function 8 will distinguish four different states rather than presenting one generic green readiness badge: **structurally configured**, **provider authentication verified**, **operation tested**, and **callback/return reconciliation verified**. A generic endpoint HTTP 200 is not provider authentication. A successful local checkout session creation is not money received. A browser URL containing `payment=success` is not authoritative payment state.

The provider verification feature will be opt-in and tenant-administrator controlled. It will use the existing tenant provider runtime loader, active encrypted secrets, configured environment, endpoint allowlisting, bounded timeout, and audit logger. It will never expose plaintext credentials or raw provider payloads to the browser, and it will never send an SMS, place a voice call, create a Fawry payment reference, submit an ETA invoice, or move an invoice balance merely because an administrator clicked **Verify provider**.

## Durable evidence model

A new additive `provider_verification_runs` table will record one tenant/provider/environment verification attempt. It will contain a UUID, tenant/provider/connection linkage, verification type, idempotency key, status (`queued`, `running`, `passed`, `failed`, `not_supported`), safe result code, sanitized message, safe evidence JSON, started/completed timestamps, actor, request ID, and an expiry timestamp. A unique tenant/provider/environment/idempotency key prevents duplicate concurrent verification attempts. The evidence JSON will be allowlisted by provider and will never include secrets, authorization headers, full tokens, customer contact data, payment amounts, or raw provider responses.

The verification route will return an existing in-flight or completed row for the same idempotency key and will return safe tenant-scoped history/latest status through Settings. Failed verification remains durable and auditable. Expiry prevents old success from being presented as current proof after credentials or environment change.

## Provider-specific verification adapters

| Provider | Verification type | Safe operation | Explicit non-claim |
|---|---|---|---|
| Stripe | `sandbox_authentication` and `sandbox_checkout` | With a configured sandbox/test secret, call the Stripe account/balance API through the SDK, verify the returned `livemode` matches the configured environment, and use a deterministic idempotency key for checkout creation. The checkout sandbox test uses a test session fixture and the existing confirmation service; it does not charge a real card. | Account authentication does not prove webhook delivery. Checkout creation does not settle an invoice until the existing authoritative session retrieval and callback reconciliation path confirms `paid`. |
| Fawry | `sandbox_readiness` | Validate signed request construction, configured sandbox endpoint, merchant fields, and provider contract metadata. Do not create a payment reference from Settings because that may initiate a payable transaction. | No business-operation or callback success is claimed until an administrator performs the configured payment-reference and callback workflow with provider sandbox credentials. |
| Twilio | `account_authentication` | Authenticate the tenant’s Account SID/auth token through the current Twilio SDK account-fetch API and record only masked account identity, account status, and environment label. | The Settings verification never sends SMS, WhatsApp, or voice traffic. Delivery remains an explicit operational action with its own result. |
| ETA | `oauth_authentication` | Reuse the existing ETA OAuth client-credentials request against the configured identity endpoint and record token-success metadata without retaining the token or claiming document acceptance. | OAuth success does not claim document submission, tax acceptance, status approval, or callback delivery. |
| InstaPay manual | Not supported | Keep structural readiness and manual reconciliation only. | No external provider verification or online-rail claim is permitted. |

Stripe sandbox authentication must fail closed when a production secret returns `livemode: true` for a sandbox verification, or when a sandbox/test secret returns `livemode: false` for production. Fawry and ETA endpoint calls use the configured environment and existing URL safety controls. Twilio has no universal sandbox-account flag, so its test is explicitly account authentication rather than a fabricated sandbox mode.

## Stripe checkout and return-state reconciliation

Stripe checkout creation will accept an optional client-generated idempotency key and persist it with the pending transaction through an additive payment idempotency field and unique tenant/provider constraint. Retries with the same key return the original pending session result instead of creating a second provider session. The key cannot be reused for a different tenant, invoice, currency, or amount.

The billing page will handle Stripe success/cancel query parameters as untrusted navigation hints. It will call an authenticated backend refresh endpoint with the session ID, and the backend will load the tenant-owned payment transaction, retrieve the Stripe session using the tenant provider secret, verify metadata and exact amount, and delegate to the same idempotent confirmation path used by the webhook. A cancelled return may mark only the matching pending transaction as cancelled after safe session binding; it must never alter invoice paid/due state. The UI will display the authoritative invoice state returned by the backend and remove the query parameter from the visible URL.

The webhook remains independently authenticated by its raw-body Stripe signature. Webhook delivery and browser return are two delivery paths to the same idempotent reconciliation operation; neither path trusts the other or can finalize twice.

## API and permission boundary

Provider verification endpoints will use `settings.manage` for initiating a verification and `settings.view` for reading safe verification evidence. Stripe return refresh will use `billing.view` and must resolve the tenant from the authenticated request and stored transaction; it will never accept a tenant selector. Existing `billing.create` remains the permission for creating checkout sessions. Third-party callbacks remain signature-authenticated and do not receive a browser tenant context.

## Test boundary

All repository tests will use mocked Stripe SDK calls, mocked Twilio account fetches, mocked ETA OAuth responses, and mocked Fawry HTTP boundaries. No real external request, payment, message, call, tax submission, or provider credential will be used in automated tests. PostgreSQL integration tests will apply the additive migrations and prove tenant isolation, idempotency, environment mismatch rejection, safe evidence redaction, permission boundaries, Stripe return/webhook race behavior, exact amount checks, and no invoice mutation on cancelled/unpaid sessions.

The implementation will remain reversible: new columns/tables are additive, existing payment history is preserved, existing callbacks continue to use their hardened paths, and manual InstaPay remains unchanged.
