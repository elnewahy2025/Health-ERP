# Function 10 Financial Utility Design

**Design date:** 20 August 2026

## Safe boundary

The four legacy exports are unreferenced and represent unsafe implicit behavior rather than a supported clinic operation. Function 10 will delete them from the payment service rather than replacing them with new defaults. This is the least invasive reversible change: active Stripe checkout/confirmation/return, Fawry provider operations, manual InstaPay reconciliation, ETA invoice submission/status/callback handling, and the authenticated payment-link route remain intact.

## Currency policy

The generic clinic core must not calculate exchange rates from a static application table. The active payment and invoice workflows use one tenant-configured currency for the transaction and provider protocol fields where required. A future cross-currency feature must be a separately specified provider/configuration service with a tenant-selected rate source, effective timestamp, precision and rounding policy, stale-rate handling, and audit evidence. Function 10 does not invent such a service because no active call site requires it.

## InstaPay policy

The removed `generateInstaPayPayment` helper must not be replaced by an environment wallet or URI redirect. The supported current state is the tenant-configured manual transfer workflow: invoice-linked pending request, immutable instruction snapshot, local reference, explicit staff verification, exact amount matching, atomic settlement/rejection, idempotency, and audit. Any future online provider adapter must be separately registered and verified before it can produce an external payment state.

## ETA policy

The removed `generateEtaQrCode` helper is not a compliant ETA QR implementation. The existing ETA service remains the only regulatory path and uses the configured ETA profile, official document structure, signing boundary, submission/status/callback workflow, and provider-specific tests. No simplified local Base64 payload may be reintroduced under a generic helper name.

## Compatibility and validation

Because no source or package export imports the four helpers, removal has no runtime compatibility impact in the current repository. A focused source-contract test will protect the removal and assert that active tenant/provider resolution remains present. The implementation will be followed by backend/frontend type checks, full unit suites, production build, `git diff --check`, and the repository’s existing focused payment/provider tests.
