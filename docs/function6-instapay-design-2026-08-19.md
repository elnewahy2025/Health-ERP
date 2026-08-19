# Function 6 design: manual InstaPay transfer and reconciliation

## Product decision

Health-ERP will not claim to integrate with InstaPay’s external payment rail in this slice. The safe production state is **manual InstaPay transfer instructions with staff-controlled reconciliation**. The application will show the patient or cashier the clinic’s administrator-configured destination and a local transfer reference. It will not mark an invoice paid until an authorized staff member verifies the transfer against the clinic’s bank or wallet statement.

The existing process-wide `INSTAPAY_WALLET` environment variable will no longer be used by the operational route. Manual transfer instructions are tenant configuration, not deployment-level demo data, and are editable from **Settings → Integrations**. The existing clinic currency setting remains authoritative for the clinic’s financial currency; the manual instruction response snapshots that currency so the historical request remains understandable after later settings changes.

## Configuration contract

The existing generic clinic-configuration registry will receive tenant-scoped keys. Empty values and disabled mode are safe defaults; no clinic name, wallet, account, currency, or transfer instructions are seeded.

| Key | Type | Default | Purpose |
|---|---|---:|---|
| `clinic.payments.instapay.enabled` | boolean | `false` | Explicitly enables the manual transfer workflow for the tenant. |
| `clinic.payments.instapay.wallet_identifier` | string | `''` | Administrator-entered InstaPay wallet or account destination. |
| `clinic.payments.instapay.account_name` | string | `''` | Account or wallet holder name shown with the destination. |
| `clinic.payments.instapay.reference_prefix` | string | `''` | Tenant-chosen prefix for generated local transfer references. |
| `clinic.payments.instapay.instructions` | string | `''` | Administrator-authored payment instructions shown to staff or the patient. |

The backend considers manual InstaPay ready only when enabled, all required values are nonblank, the configured prefix is bounded and safe, and the clinic currency is a valid three-letter code. A missing or invalid configuration returns an actionable `409` response and never creates a transaction. The workflow is tenant-wide so that branch and department permission scopes remain intact without silently choosing a branch-specific bank destination.

## Persistence contract

Migration `065_manual_instapay_reconciliation.ts` adds a dedicated `manual_instapay_reconciliations` table. The existing `payment_transactions` row remains the financial ledger entry and is linked through `payment_transaction_id`; it uses `provider_key = 'instapay_manual'`, `method = 'wallet'`, `status = 'pending'`, and the generated local reference. The dedicated row stores the workflow state, requested and verified received amounts, clinic currency, immutable instruction snapshot, external statement reference, transfer date, decision actor, decision timestamp, and decision notes.

| Field group | Design |
|---|---|
| Tenant and invoice binding | `tenant_id`, `invoice_id`, and `payment_transaction_id` are mandatory and tenant-scoped. The route loads the invoice and patient through existing billing access checks. |
| Local reference | Generated from the configured prefix plus a cryptographically random suffix; unique per tenant and never used as proof of payment. |
| Instruction snapshot | Stores the destination, account name, instructions, and currency shown when the request was created. This preserves historical context without relying on mutable settings. |
| Workflow state | `awaiting_transfer` → `reconciled` or `rejected`. A request is not a payment until the reconciled state is reached. |
| Verification evidence | `external_reference`, `received_amount`, `transfer_date`, and required decision notes are captured by the verifying staff member. External references are unique per tenant to prevent statement-reference reuse. |
| Auditability | Created, reconciled, and rejected actions record actor and timestamp in the reconciliation row and in the existing audit log. |

## API contract

`POST /api/v1/payments/instapay` accepts an invoice ID and a requested amount no greater than the current invoice due amount. It requires `billing.create`, checks tenant/branch/department/assigned-patient access through the existing invoice authorization model, validates manual configuration, creates an invoice-linked pending request, and returns the local reference plus the instruction snapshot. It does not accept a claimed external transfer reference and does not settle the invoice.

`GET /api/v1/invoices/:invoiceId/instapay-reconciliations` returns nonsecret reconciliation history after the existing invoice access check. The response includes local reference, requested/received amounts, currency, workflow state, external reference, transfer date, decision metadata, and the immutable instruction snapshot needed by authorized billing staff.

`POST /api/v1/payments/instapay/:reconciliationId/reconcile` requires `billing.verify`. It accepts the statement’s external reference, verified received amount, transfer date, and decision notes. The service locks the reconciliation, payment transaction, and invoice in one PostgreSQL transaction. It requires an exact received/requested amount match, rejects amounts that would exceed the invoice due amount, updates invoice `paid`, `due`, `status`, `payment_method = 'wallet'`, and `paid_at` atomically, marks the ledger transaction completed, and records the reconciliation. Repeating the same request after reconciliation returns the existing result without adding paid amount a second time.

`POST /api/v1/payments/instapay/:reconciliationId/reject` requires `billing.verify` and a nonblank reason. It locks the reconciliation, marks it rejected, marks the pending ledger transaction failed, and leaves invoice balances unchanged. Repeating rejection is idempotent; a rejected request cannot be reconciled later. A new manual request may be created if the clinic needs to retry.

The old unauthenticated callback route will be removed from the operational behavior. It will return a clear manual-mode unsupported response rather than mutating transactions from an untrusted request body. No callback, webhook, or external InstaPay verification is claimed in this slice.

## Authorization contract

The permission catalog gains `billing.verify`. `billing_manager` receives it at branch scope, `billing_officer` receives it at branch scope, and `accountant` receives it at tenant scope. Existing `billing.*` wildcard grants continue to cover the action, while receptionist, appointment, and general billing-creation roles do not gain verification rights automatically. Backend authorization is mandatory; frontend gates only control visibility and user experience. Custom tenant roles are not rewritten.

## Frontend contract

The Billing payment modal will separate **External provider payments**, **Manual InstaPay transfer instructions**, and **Payment reconciliation history**. A staff member with `billing.create` can generate an invoice-linked instruction request. The UI displays the configured destination, account name, currency, instructions, amount, and local reference, and clearly labels the request as awaiting manual verification. A staff member with `billing.verify` sees confirmation and rejection controls, must enter the statement reference, verified received amount, transfer date, and decision notes, and receives a status update without a second invoice payment action. The interface never renders `PENDING_CONFIG` or presents a local reference as an online payment confirmation.

## Test acceptance criteria

Focused backend tests will cover disabled or incomplete configuration, invoice-link and due-amount validation, tenant and scope boundaries, atomic reconciliation, amount mismatch, overpayment rejection, idempotent repeated reconciliation, idempotent rejection, external-reference uniqueness, and legacy callback non-mutation. PostgreSQL integration tests will use the repository’s existing disposable test database and real migrations. Frontend tests will cover the manual-only labels, settings-backed destination rendering, verification fields, and separation from `billingApi.pay` and Fawry/Stripe actions.
