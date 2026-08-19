# Function 6 InstaPay audit notes

The current `POST /api/v1/payments/instapay` route is a placeholder. It accepts only a positive amount, reads the process-wide `INSTAPAY_WALLET` environment variable, creates an unlinked `payment_transactions` row with `invoice_id: null`, status `pending`, and no `provider_key`, then returns a generated reference and either the environment wallet or `PENDING_CONFIG`. It does not verify a transfer, link the request to an invoice, enforce invoice access, reconcile amount, or settle the invoice.

The current `POST /api/v1/payments/instapay/callback` route is unsafe: it accepts any unauthenticated `reference` or `transactionId`, updates every matching transaction by `instapay_reference` without tenant scoping, does not verify a trusted provider signature, does not lock a transaction or invoice, does not validate amount or invoice linkage, and does not update invoice paid/due/status fields. It is not a valid integration callback and must not remain exposed as one.

The existing billing module has reusable invoice access logic for tenant, branch, department, and assigned-patient scopes. Internal payment recording uses `billing.create` at the backend route, while the billing page’s action gate uses `billing.approve`; provider payment history only returns transactions with a non-null `provider_key` and is already tenant- and invoice-scoped. Billing manager has `billing.*` at branch scope; billing officer has view/create/edit/approve at branch scope; accountant has tenant billing view/export only. The permission catalog has no dedicated reconciliation action, but `billing.verify` can be added as a catalog action without changing existing permission names.

The frontend InstaPay client only posts `{ amount }` to `/payments/instapay`; the billing page exposes Stripe and Fawry actions but no InstaPay UI. Shared `PaymentMethod` already includes `wallet` and `bank_transfer`, while no manual reconciliation type exists.

The safest production implementation is manual mode, not a claimed InstaPay provider integration. Administrators should configure tenant-scoped transfer instructions in Settings rather than use `INSTAPAY_WALLET`; staff should create an invoice-linked transfer request that remains `pending_manual`, show the configured account/wallet instructions and a generated reference, and confirm/reject it after checking the clinic’s bank/wallet statement. Confirmation must be an authenticated, permission-checked, tenant/branch-scoped transaction that locks the transfer and invoice, validates the submitted amount against the invoice due amount, updates the invoice and transaction atomically, is idempotent, and records actor/reason/audit data. Rejection should preserve the request history and require a reason; it must not settle the invoice. Any legacy callback should be removed or return a clear unsupported/manual-mode response rather than mutate data.

Relevant files: `packages/backend/src/modules/financial-deepening/index.ts`, `packages/backend/src/modules/billing/index.ts`, `packages/backend/migrations/017_financial_deepening.ts`, `packages/backend/migrations/055_payment_provider_status.ts`, `packages/backend/migrations/056_payment_callback_hardening.ts`, `packages/backend/migrations/057_provider_reference.ts`, `packages/shared/src/authz/index.ts`, `packages/shared/src/types/domain.ts`, `packages/frontend/src/pages/BillingPage.tsx`, and `packages/frontend/src/lib/api/payment.ts`.

Acceptance target: no hardcoded production wallet; no fake external confirmation; invoice-linked request; explicit manual-only UX; controlled confirm/reject flow; full tenant and scope checks; idempotency; audit; focused unit/integration/frontend tests; documentation; commit and push before Function 7.

## References

[1]: `docs/incomplete-function-priority-roadmap-2026-08-19.md`
[2]: `packages/backend/src/modules/financial-deepening/index.ts`
[3]: `packages/backend/src/modules/billing/index.ts`
[4]: `packages/shared/src/authz/index.ts`
[5]: `packages/frontend/src/pages/BillingPage.tsx`
