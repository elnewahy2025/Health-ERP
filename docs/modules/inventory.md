# Module Doc: inventory

**Location:** `packages/backend/src/modules/inventory/` (+ `pharmacy`, `barcodes`) · **Pattern:** Clean Architecture (core)

---

## Purpose
Inventory management: items, warehouses, stock transactions, purchase orders, suppliers, pharmacy stock, and barcode support.

## Responsibilities
- Item master (medical + general items)
- Warehouse/stock management with transactions ledger
- Purchase orders + receiving
- Pharmacy-specific inventory + dispensing decrement
- Barcode generation, registry, scanning logs

## Functional Requirements
- CRUD items, warehouses, suppliers
- Stock in/out/adjust transfers recorded in `inventory_transactions`
- Purchase orders with line items; receive → stock in
- Reorder alerts at threshold
- Barcode templates/labels; scan log for pharmacy
- Pharmacy prescriptions decrement stock

## Non-Functional Requirements
- Stock accuracy: ledger-based (no direct mutation); transactions in DB tx
- Concurrent-safe stock updates (unique partial indexes; row locking)
- Search via pg_trgm on item name/code

## Business Rules
- Stock never goes negative (checked within tx)
- Item code unique per tenant
- Transfers require source/target warehouse validation
- Pharmacy dispensing validates prescription + availability

## Database Entities
`inventory_items`, `inventory_transactions`, `warehouses`, `suppliers`, `purchase_orders`, `purchase_order_items`, `pharmacy_inventory`, `pharmacy_prescriptions`, `pharmacy_prescription_items`, `barcode_registry`, `barcode_templates`, `barcode_labels`, `barcode_scan_logs`.

## API Endpoints
`/api/v1/inventory` (items, stock, POs, transfers), `/api/v1/pharmacy` (dispense, stock), `/api/v1/barcodes`.

## User Permissions
`inventory:view/create/update`, `inventory:receive`, `pharmacy:dispense`; roles per tenant.

## Dependencies
billing (item pricing), emr (prescriptions), notification (reorder alerts), shared types.

## Internal Architecture
Clean Architecture core files; pharmacy builds on inventory primitives.

## Data Flow
PO create → approve → receive → stock-in transaction → inventory update → audit. Dispense → validate prescription → decrement stock (tx) → scan log → notify.

## Validation Rules
Zod: quantities > 0, unit enum, item refs, warehouse refs, PO status transitions.

## Error Handling
`ConflictError` (insufficient stock), `NotFoundError`, `ValidationError` (negative qty).

## Security Considerations
- RLS tenant scoping; audit stock movements
- Price/cost fields RBAC-protected
- Barcode scan logs are append-only

## Logging & Monitoring
Audit `inventory:*`; stock-out alerts; reorder thresholds; transaction ledger integrity checks.

## Test Strategy
`inventory.test.ts`, `pharmacy.test.ts` — stock ledger, negative-stock prevention, PO receive, dispensing.

## Future Improvements
- Batch/expiry tracking; serial numbers; supplier portals; kiosk stocktake.

---

*Related: [EMR](emr.md) · [Billing](billing.md) · [Database spec](../engineering/DATABASE-SPECIFICATION.md)*
