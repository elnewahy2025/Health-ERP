# Analytics — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Scope:** product + clinical + business analytics

---

## 1. In-App Analytics (BI)

- `bi` module: dashboards (`dashboard_definitions`, `dashboard_widgets`) with recharts visualizations.
- Data warehouse tables (`dw_patient_stats`, `dw_appointment_stats`, `dw_revenue_stats`) feed reporting without OLTP load.
- `AnalyticsDashboardPage`, `PredictiveAnalyticsPage`, `BiPage` expose BI to staff and admin.

## 2. Business Metrics

| Metric | Source | Purpose |
|---|---|---|
| Appointments per day/week, no-show rate | appointments + reminders | capacity planning |
| Revenue: billed vs collected, AR aging | invoices + payments | financial health |
| Patient acquisition & visits | patients + appointments | growth |
| Inventory turnover, stock-outs | inventory transactions | procurement |
| Staff utilization (appointments/doctor) | appointments + employees | staffing |
| Claims cycle time | insurance_claims | payer performance |
| AI usage & cost | ai_cost_logs | cost control |

## 3. Product & Usage Telemetry (planned)

- Privacy-safe, aggregate-only product events (page views, feature usage) — no PII, no raw event data retained beyond retention policy.
- Consent-first: tenant/enterprise opt-in; `data_consent_logs` governs.
- Planned pipeline: frontend events → backend ingestion endpoint → warehouse `usage_records` → BI dashboards.

## 4. Clinical Analytics

- Population health views: risk scores (`patient_risk_scores`), diagnosis distributions (ICD-10), medication utilization.
- AI predictions surfaced with confidence and explanation (see `docs/ai/`).

## 5. Reporting vs Analytics

- **Reports** = scheduled, exportable, audit-oriented (`report_definitions`, `report_executions`, exports).
- **Analytics/BI** = interactive exploration (dashboards, drill-downs).
- Both read from `dw_*` aggregates first; OLTP fallback with explicit query guardrails.

## 6. Data Governance

- Retention per `data_retention_policies`; aggregate data outlives raw PII.
- Anonymization before archival; audit of export jobs (`export_jobs`).
- Dashboards respect RBAC: patient-level metrics restricted by role and tenant.

## 7. Implementation Notes

- Charts: recharts (line/bar/pie/area) wrapped in `ChartCard`.
- Date ranges: fixed presets (today/7d/30d/quarter) + custom; timezone = clinic locale.
- Currency: EGP (`formatCurrency`); numbers localized.

---

*Related: [BI module](../modules/bi.md) · [Reports module](../modules/reports.md) · [Privacy](CONTENT-GUIDELINES.md#)*
