# Provider contract research notes

## Fawry official staging documentation

Source: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis

The official Fawry staging payment-reference page documents the staging endpoint `https://atfawry.fawrystaging.com/ECommerceWeb/Fawry/payments/charge` and the production endpoint `https://www.atfawry.com/ECommerceWeb/Fawry/payments/charge`. Required request fields include `merchantCode`, `merchantRefNum`, `paymentMethod`, `customerMobile`, `customerEmail`, `amount`, `description`, `language`, and `chargeItems`. Each charge item requires `itemId`, `description`, `price`, and `quantity`. The request signature is SHA-256 over the concatenated merchant code, merchant reference number, optional customer profile id, payment method, amount formatted to two decimals, and secure key. The documented response includes a Fawry reference number, merchant reference number, order/payment amounts, order status, provider status code/description, and related payment fields.

Source: https://developer.fawrystaging.com/docs/sdks/payment-notifications/server-notification-v2

The official Fawry Server-to-Server Notification V2 page states that the merchant callback URL is configured during merchant account setup, separately for development and production, rather than supplied with every order. Callback requests are HTTP POST payloads containing fields such as `requestId`, `fawryRefNumber`, `merchantRefNumber`, `paymentAmount`, `orderAmount`, `orderStatus`, `paymentMethod`, and `messageSignature`. The V2 message signature is SHA-256 over `fawryRefNumber + merchantRefNumber + paymentAmount (two decimals) + orderAmount (two decimals) + orderStatus + paymentMethod + payment reference number when present + secureKey`. Documented statuses include `NEW`, `PAID`, `CANCELEDREFUNDED`, `EXPIRED`, `PARTIAL_REFUNDED`, and `FAILED`.

## Implementation implications

The existing code already verifies Fawry V2 callback signatures and binds callbacks to tenant/provider transactions. The next safe boundary should therefore focus on a tenant-scoped Fawry payment-reference adapter that uses provider-configured endpoints and currency, builds the documented request shape, validates the response before creating the local pending transaction, and never fabricates a redirect URL or uses clinic-specific defaults. The callback URL should remain a merchant configuration concern and must not be inferred from a per-request client field.

## Stripe official documentation

Source: https://docs.stripe.com/api/checkout/sessions

Stripe documents Checkout Sessions as server-created sessions for one-time purchases or subscriptions. A new session is recommended for each customer payment attempt, and the server redirects the customer to the Checkout Session URL. The Checkout Session contains a reference to the successful PaymentIntent after payment. The documented object includes a client reference id for reconciliation and a three-letter lowercase ISO currency code. The existing clinic implementation should continue to use the tenant-configured currency and internal invoice metadata for reconciliation rather than trusting browser-provided values.

Source: https://docs.stripe.com/webhooks

Stripe requires the raw request body, the `Stripe-Signature` header, and the endpoint secret for signature verification. It explicitly warns that framework manipulation of the raw body causes verification to fail. Stripe also recommends returning a successful 2xx response quickly before complex downstream logic and requires event-origin verification before modifying records. Test-mode webhook endpoint secrets are distinct endpoint credentials and can be obtained from the Stripe test-mode webhook configuration or Stripe CLI during local testing.

## Implementation implications

The existing Stripe implementation already preserves the raw request body and verifies the Stripe signature before confirmation. The next provider-specific work should not replace that callback boundary. It should add explicit sandbox/live environment endpoint selection and adapter-level request/response normalization around Checkout Session creation, while retaining tenant metadata checks, amount reconciliation, idempotency, and internal payment separation.
