# Module Doc: reports

**Location:** `packages/backend/src/modules/reports/` (+ `compliance-reports`, `print-templates`, `pdf`)

---

## Purpose
Report definitions, scheduling, execution, and export (PDF/CSV) for operational and compliance reporting.

## Responsibilities
- Define reports (query/config based)
- Schedule recurring executions (BullMQ)
- Render + export results (PDF via pdfmake, CSV)
- Print templates for receipts/invoices/labels

## Functional Requirements
- CRUD report definitions
- Run on demand + scheduled
- Export formats: PDF, CSV, print templates
- Compliance report variants

## Non-Functional Requirements
- Long-running reports run async (jobs); p95 for on-demand < 5 s
- Read from `dw_*` aggregates where available
- RBAC on report access (financial/compliance sensitive)

## Business Rules
- Reports scoped by tenant; sensitive reports require elevated role
- Scheduled reports log every execution (`report_executions`)
- Exports audited (`export_jobs`)

## Database Entities
`report_definitions`, `report_executions`, `report_schedules`, `reports`, `export_definitions`, `export_jobs`, `print_templates`.

## API Endpoints
`/api/v1/reports` (definitions, executions, schedules), `/api/v1/print-templates`, `/api/v1/data-export`.

## User Permissions
`reports:view/create/run`; role tiers for financial/compliance reports.

## Dependencies
BI/data-warehouse, pdf service, notification (delivery of scheduled reports), auth RBAC.

## Internal Architecture
Definition → runner (query builder + renderer) → job → storage + delivery.

## Data Flow
Create definition → schedule/run → job renders → store result → notify owner → log execution.

## Validation Rules
Zod: report config schema, schedule cron validation, export format enum.

## Error Handling
`ValidationError` (bad definition), `NotFoundError`; job failures recorded with retry.

## Security Considerations
- RBAC + RLS on report data; exports contain PII → audited + retention-limited
- PDF generation via pdfmake (no shelling out)

## Logging & Monitoring
Execution metrics, failure alerts, export audit; query latency tracking.

## Test Strategy
`reports.test.ts` — definition validation, scheduling, export generation.

## Future Improvements
- Report builder UI (drag-drop); parameterized filters; scheduled email delivery; BI drill-through.

---

*Related: [BI](bi.md) · [Compliance](compliance.md) · [Billing](billing.md)*
