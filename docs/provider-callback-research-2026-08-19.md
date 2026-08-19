# Provider callback research notes — 19 August 2026

## Stripe official documentation

Source: https://docs.stripe.com/webhooks

Stripe webhook handlers receive JSON Event objects through HTTPS POST requests. Stripe recommends verifying the webhook signature using the raw request body, the `Stripe-Signature` header, and the endpoint signing secret, preferably with an official Stripe library. The official examples reject invalid payloads and invalid signatures with HTTP 400. Stripe also recommends returning a successful 2xx response promptly after handling webhook delivery requirements and testing handlers with the Stripe CLI.

Source: https://docs.stripe.com/webhooks/handling-payment-events

Stripe documents asynchronous payment events such as `payment_intent.succeeded`, and states that each event includes a signature in the `Stripe-Signature` header so the receiver can verify that the event came from Stripe rather than a third party. The page recommends configuring a webhook endpoint secret and using `Stripe::Webhook.construct_event` or equivalent SDK verification.

## Fawry official staging documentation

Source: https://developer.fawrystaging.com/docs/sdks/payment-notifications/server-notification-v2

Fawry Server-to-Server Notification V2 uses an HTTP POST callback configured during merchant setup. The callback includes `fawryRefNumber`, `merchantRefNumber`, `paymentAmount`, `orderAmount`, `orderStatus`, `paymentMethod`, `paymentRefrenceNumber`, and `messageSignature`. Fawry documents the SHA-256 signature input as: `fawryRefNumber + merchantRefNum + payment amount in two-decimal format + order amount in two-decimal format + order status + payment method + payment reference number if present + secureKey`. Statuses include `NEW`, `PAID`, `CANCELED`, `REFUNDED`, `EXPIRED`, `PARTIAL_REFUNDED`, and `FAILED`. Fawry says a 200 response marks the callback delivered; otherwise it retries.

Source: https://developer.fawrystaging.com/docs/payment-notifications/server-notification-v1

Fawry Server-to-Server Notification V1 uses an HTTP GET callback configured during merchant setup. Its parameters include `FawryRefNo`, `MerchnatRefNo`, `OrderStatus`, `Amount`, and `Message Signature`. Fawry documents the V1 signature as MD5 over: `secureKey + amount in two-decimal format + fawryRefNo + merchantRefNum + orderStatus`. The current repository route is a POST endpoint and therefore must not assume V1 field names or MD5 rules without an explicit compatibility mode.

## Implementation implications

The existing repository currently checks only Fawry signature presence, not cryptographic validity; uses a reference-only lookup for callback runtime resolution; updates Fawry rows by provider/reference but does not reconcile callback amount or invoice linkage; and Stripe confirmation retrieves the session and updates invoice/payment state without an explicit idempotent finalization guard. The hardening design must preserve provider-specific callback versions, verify signatures before state mutation, bind the callback to a single tenant/provider transaction, compare provider amount with the recorded transaction amount, and make repeated callbacks safe.
