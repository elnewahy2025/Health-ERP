# Module Doc: bi

**Location:** `packages/backend/src/modules/bi/` (+ `dashboard-widgets`, `data-warehouse`, `analytics` pages)

---

## Purpose
Business intelligence: dashboards, widgets, and analytics over warehouse aggregate data.

## Responsibilities
- Dashboard definitions + widgets
- Aggregate data (`dw_patient_stats`, `dw_appointment_stats`, `dw_revenue_stats`)
- Interactive analytics endpoints (recharts-backed)
- Predictive analytics surfaces (AI predictions)

## Functional Requirements
- Define dashboards/widgets per role/tenant
- Query aggregate stats for charts (appointments, revenue, patients)
- Drill-down links to OLTP reports
- Show AI predictions with confidence

## Non-Functional Requirements
- Warehouse reads only — no OLTP load for dashboards
- Cache expensive aggregates (Redis)
- p95 < 500 ms for dashboard load

## Business Rules
- Widgets scoped by tenant + role
- Aggregate freshness documented per widget (ETL schedule)
- PII never rendered in aggregate charts (counts only)

## Database Entities
`dashboard_definitions`, `dashboard_widgets`, `dw_patient_stats`, `dw_appointment_stats`, `dw_revenue_stats`, `ai_predictions`.

## API Endpoints
`/api/v1/bi` (dashboards, widgets, stats), `/api/v1/dashboard-widgets`, predictive analytics endpoints.

## User Permissions
`bi:view` per role tier; admin sees cross-branch aggregates.

## Dependencies
data-warehouse, reports, ai-intelligence (predictions), auth RBAC.

## Internal Architecture
Widget renderer consumes stats endpoints; frontend `ChartCard` (recharts) renders series.

## Data Flow
Dashboard load → resolve widget list → fetch aggregate stats → render charts → cache.

## Validation Rules
Zod: widget type enum, time range, tenant scope, chart config schema.

## Error Handling
`NotFoundError` (dashboard), `ValidationError` (bad widget config); aggregates missing → graceful empty state.

## Security Considerations
- RBAC + RLS; counts only (no PII); audit dashboard changes

## Logging & Monitoring
Query latency metrics; cache hit ratio; ETL freshness alerts.

## Test Strategy
Covered by reports tests + module test files; chart config validation tests.

## Future Improvements
- ETL scheduler + freshness SLA; custom SQL widgets (sandboxed); export dashboards to PDF.

---

*Related: [Analytics](../product/ANALYTICS.md) · [Reports](reports.md) · [Data model](../core/DATA-MODEL.md)*
