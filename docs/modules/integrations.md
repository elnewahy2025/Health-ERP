# Module Doc: integrations

**Location:** `packages/backend/src/modules/integrations/` (+ `api-gateway`)

---

## Purpose
Third-party connectors: webhooks, API keys, payment/SMS/email/storage adapters, and external API exposure.

## Responsibilities
- Webhook registry + delivery + logs
- API key management + usage logs
- Integration definitions/connections (connectors)
- Outbound adapters: email, SMS, WhatsApp, payments, storage, AI
- Expose tenant-scoped external APIs via api-gateway

## Functional Requirements
- Register webhooks; HMAC-signed delivery; retries; logs
- Issue/rotate API keys; log usage
- Manage integration connections (credentials per tenant)
- Gateway routes for external consumers (api keys)

## Non-Functional Requirements
- Webhook delivery retries with backoff; dead-letter alerts
- API key hashing at rest; scoped permissions
- Outbound timeouts + circuit breaking

## Business Rules
- Webhook URLs must be HTTPS + validated (SSRF)
- API keys scoped to tenant + permission set
- Secrets stored encrypted (AES-256-GCM)

## Database Entities
`webhooks`, `webhook_logs`, `api_keys`, `api_key_logs`, `integration_definitions`, `integration_connections`.

## API Endpoints
`/api/v1/integrations` (webhooks, api-keys, connections), `/api/v1/api-gateway` (external), `/api/v1/webhooks` (receive).

## User Permissions
`integrations:manage`; API keys grant scoped app-level access; platform admin for global connectors.

## Dependencies
all service adapters (email/sms/whatsapp/payment/storage), notification, audit.

## Internal Architecture
Adapter interfaces + registry; webhook dispatcher via BullMQ; gateway validates API keys + scope.

## Data Flow
Webhook register → event → sign + enqueue → deliver → log → retry. API key auth → gateway middleware → route to module → usage log.

## Validation Rules
Zod: webhook URL + events, key scopes, connector config schema.

## Error Handling
`ValidationError` (bad URL), `ForbiddenError` (scope), delivery failures logged with retry.

## Security Considerations
- SSRF validation; HMAC signatures; key hashing; encrypted connector secrets; audit all connector changes

## Logging & Monitoring
Delivery success/failure; key usage; connector health; alerts on webhook failures.

## Test Strategy
Module tests: webhook signing/retry, key scoping, connector config validation.

## Future Improvements
- Marketplace of connectors; OAuth flows; event catalog docs; rate-limit per integration.

---

*Related: [Notifications](notification.md) · [Billing](billing.md) · [Security](../engineering/SECURITY.md)*
