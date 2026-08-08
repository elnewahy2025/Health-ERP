# Module Doc: saas-billing

**Location:** `packages/backend/src/modules/saas-billing/` (+ `usage_records` consumers)

---

## Purpose
Platform monetization: tenant subscriptions, plans, invoices, and usage metering.

## Responsibilities
- Subscription plans CRUD
- Tenant subscription lifecycle (trial/active/past-due/cancelled)
- Subscription invoices + payments (Stripe optional)
- Usage metering (`usage_records`) → overage/billing

## Functional Requirements
- Plan management (features, pricing, limits)
- Subscribe/change/cancel tenant plans
- Generate subscription invoices
- Record usage events per tenant (AI, storage, users)

## Non-Functional Requirements
- Usage metering idempotent; aggregation for billing cycles
- Payment integration optional (Stripe env-config)
- Audit subscription changes

## Business Rules
- Plan limits enforced by gateways (users, modules, AI usage)
- Downgrade takes effect at cycle end (configurable)
- Cancellation retains tenant data per retention policy

## Database Entities
`subscription_plans`, `tenant_subscriptions`, `subscription_invoices`, `usage_records`.

## API Endpoints
`/api/v1/saas` (plans, subscriptions, invoices, usage).

## User Permissions
Platform admin (plans, all tenants); tenant owner (own subscription).

## Dependencies
billing, integrations (Stripe), audit, notification (dunning emails).

## Internal Architecture
Service + repository; usage ingestion endpoint → aggregation jobs (BullMQ).

## Data Flow
Signup → default plan trial → usage events recorded → cycle close → aggregate → invoice → notify → collect (Stripe) → renew/downgrade.

## Validation Rules
Zod: plan schema, cycle enum, usage event payload, limits.

## Error Handling
`ConflictError` (plan change mid-cycle), `ValidationError`, payment gateway errors mapped.

## Security Considerations
- RBAC platform/admin split; usage data tenant-scoped; no card data stored

## Logging & Monitoring
Usage aggregation jobs; dunning events; MRR metrics; alerts on failed cycle close.

## Test Strategy
Module tests: plan lifecycle, usage idempotency, cycle aggregation.

## Future Improvements
- Stripe webhooks full reconciliation; usage-based pricing tiers; self-serve billing portal.

---

*Related: [White-label](white-label.md) · [Billing](billing.md) · [Roadmap](../core/ROADMAP.md)*
