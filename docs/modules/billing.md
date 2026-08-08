# Module Doc: billing

**Location:** `packages/backend/src/modules/billing/` (+ `financial-deepening`, `insurance`, `insurance-claims`)

---

## Purpose
Invoicing, payments, refunds, ETA e-invoice submission, insurance coverage, and financial reporting.

## Responsibilities
- Create/update invoices with line items (EGP)
- Record payment transactions (cash, card, Fawry, InstaPay)
- Submit invoices to ETA (QR, UUID tracking)
- Insurance coverage + claims lifecycle
- Expenses, budgets, financial reports

## Functional Requirements
- Invoice CRUD with status workflow (draft → issued → paid/void)
- Payment capture with gateway adapters (Fawry/InstaPay/Stripe optional)
- ETA e-invoice generation + submission + retry
- Insurance claims: submit, track, reconcile
- Expense tracking and budget planning

## Non-Functional Requirements
- Money math in integer EGP piasters (no float drift)
- Audit every financial write; idempotent payment recording
- p95 < 300 ms invoice load; reports from `dw_revenue_stats`

## Business Rules
- Invoice number auto-generated (`generateInvoiceNumber`), unique per tenant
- Status transitions validated; paid invoices immutable except void (with reason + audit)
- ETA submission requires valid VAT/QR data; failures logged + retryable
- Payments idempotent per `(invoice_id, gateway_ref)`

## Database Entities
`invoices`, `invoice_items`, `payment_transactions`, `eta_invoices`, `insurance_companies`, `insurance_claims`, `expenses`, `expense_categories`, `budget_plans`, `budget_line_items`, `business_associate_agreements`.

## API Endpoints
`/api/v1/billing` (invoices, payments, refunds, ETA submit/status), `/api/v1/insurance`, `/api/v1/insurance-claims`, financial endpoints.

## User Permissions
`billing:view/create/update/void`, `payments:collect`, `claims:manage`; RBAC per tenant; accountant role typical.

## Dependencies
patient, appointment (billable), inventory (items), integrations (payments, ETA), notification, reports.

## Internal Architecture
Service layer with repositories; gateway adapters behind payment service interface.

## Data Flow
Create invoice (tx) → submit ETA (if enabled) → collect payment → mark paid → audit → notify patient. Claims: attach coverage → submit → status webhooks/updates.

## Validation Rules
Zod: amounts ≥ 0, item refs, status transitions, ETA payload schema, payment method enum.

## Error Handling
`ValidationError`, `ConflictError` (double-pay), `NotFoundError`, gateway errors mapped to friendly codes.

## Security Considerations
- RBAC + RLS; audit financial writes
- No card data stored (gateway tokens only); payment logs redacted
- ETA credentials via env; webhook signature verification

## Logging & Monitoring
Audit `billing:*`; ETA submission success/failure metrics; AR aging reports; alerts on ETA failure spikes.

## Test Strategy
`billing.test.ts` — invoice workflow, idempotent payments, ETA payload; e2e smoke to expand.

## Future Improvements
- Recurring billing; multi-currency; automated claims reconciliation; VAT reports export.

---

*Related: [Inventory](inventory.md) · [Integrations](integrations.md) · [Analytics](../product/ANALYTICS.md)*
