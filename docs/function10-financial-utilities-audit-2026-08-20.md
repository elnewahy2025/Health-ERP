# Function 10 Financial Utility Audit

**Audit date:** 20 August 2026

## Scope

Function 10 targets the legacy helpers at the top of `packages/backend/src/services/payment.ts`: `getCurrencyInfo`, `convertCurrency`, `generateInstaPayPayment`, and `generateEtaQrCode`.

## Findings

The currency table contains hardcoded symbols and exchange rates for SAR, USD, EUR, AED, and EGP. It is not used by the active Stripe, Fawry, manual InstaPay, ETA, billing, or frontend paths. The active payment routes resolve tenant/provider configuration and use exact currency amounts; no operational route imports `getCurrencyInfo` or `convertCurrency`.

`generateInstaPayPayment` reads a process-wide `INSTAPAY_WALLET`, fabricates `IP-`/`IPAY-` references, and returns an `instapay://` redirect that could be mistaken for an integrated payment action. No source file imports it. The live InstaPay implementation is the separate tenant-configured manual reconciliation workflow with instructions, invoice linkage, statement-reference verification, exact amount matching, atomic settlement, rejection, idempotency, and explicit manual-only UX.

`generateEtaQrCode` serializes a small JSON object into Base64 while describing it as an ETA TLV QR payload. No source file imports it. The active ETA invoice service uses its own documented TLV helper and tenant-configured ETA fields. Removing the simplified helper prevents accidental use as a regulatory QR implementation.

The active `generatePaymentLink`, `createStripePayment`, Stripe confirmation/return refresh, Fawry adapters, manual InstaPay reconciliation, and ETA invoice services are not targeted. They have live call sites or dedicated tests and remain unchanged.

## Decision

Remove the four unreferenced legacy exports and their now-unused imports/constants. Do not replace the exchange-rate table with another static table. If future currency conversion is required, it must be introduced as an explicit tenant/provider-configured service with source, rate timestamp, precision, rounding, audit, and stale-rate policy. If a future ETA QR operation is required, it must use the existing ETA adapter contract and official document rules rather than the removed simplified helper.

The resulting source-level guard test will assert that the legacy names and literals are absent while active Stripe/provider runtime resolution remains present. Full backend/frontend suites, type validation, build, and whitespace checks remain release gates.
