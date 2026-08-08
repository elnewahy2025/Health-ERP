# Module Documentation — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Live

---

## 1. Module Inventory (57 backend modules)

Each module lives in `packages/backend/src/modules/<name>/` and registers via
`registerXxxModule(app)` in `packages/backend/src/index.ts`.

| Group | Modules |
|---|---|
| Identity & tenancy | `auth`, `rbac`, `session-manager`, `user-preferences`, `api-gateway` |
| Patients & clinical | `patient`, `emr`, `clinical`, `laboratory`, `radiology`, `pharmacy`, `nursing`, `home-visits`, `referral`, `medical-content`, `telemedicine` |
| Scheduling | `appointment`, `patient-scheduling`, `online-booking`, `queue`, `kiosk-checkin` (in queue) |
| Billing & finance | `billing`, `insurance`, `insurance-claims`, `saas-billing`, `financial-deepening`, `expense-tracking` (in financial) |
| Operations | `inventory`, `pharmacy-advanced` (in pharmacy), `multi-branch`, `regions`, `barcodes`, `dms` |
| People | `hr` |
| Engagement | `crm`, `communications`, `advanced-communication`, `patient-experience`, `patient-messaging`, `patient-portal`, `notification` |
| Intelligence | `ai-hub`, `ai-intelligence`, `automation`, `workflow`, `bi`, `reports`, `dashboard-widgets`, `data-warehouse`, `data-export`, `data-import` (bulk-import) |
| Platform & compliance | `compliance`, `compliance-reports`, `audit`, `white-label`, `integrations`, `api-keys` (in integrations), `print-templates`, `pdf`, `pdf-generator`, `system-monitor`, `dr-backup`, `health`, `forms` |

## 2. Module Documentation Template

Every module doc includes: Purpose, Responsibilities, Functional requirements,
Non-functional requirements, Business rules, Database entities, API endpoints,
User permissions, Dependencies, Internal architecture, Data flow, Validation rules,
Error handling, Security considerations, Logging, Monitoring, Test strategy,
Future improvements.

## 3. Deep-Dive Module Docs

| Doc | Module |
|---|---|
| [auth.md](auth.md) | Authentication, tenants, sessions, MFA, OTP |
| [patient.md](patient.md) | Patient registry, NID, encryption, RLS, timeline |
| [appointment.md](appointment.md) | Scheduling, reminders, queue, booking |
| [emr.md](emr.md) | Clinical records, encounters, orders |
| [billing.md](billing.md) | Invoices, payments, ETA, refunds |
| [inventory.md](inventory.md) | Items, stock, POs, warehouses |
| [hr.md](hr.md) | Employees, attendance, leave, payroll |
| [crm.md](crm.md) | Campaigns, feedback |
| [notification.md](notification.md) | Templates, preferences, channels |
| [reports.md](reports.md) | Definitions, schedules, exports |
| [bi.md](bi.md) | Dashboards, widgets, warehouse data |
| [compliance.md](compliance.md) | Policies, audits, retention, DR |
| [integrations.md](integrations.md) | Webhooks, API keys, connectors |
| [saas-billing.md](saas-billing.md) | Subscriptions, plans, usage |
| [white-label.md](white-label.md) | Branding, domains |

## 4. Maintenance Rule

Changing a module = update its doc in the same PR. New module = create `docs/modules/<name>.md`
from the template and add it to this index.

---

*Related: [Contributing](../engineering/CONTRIBUTING.md) · [Styleguide](../engineering/STYLEGUIDE.md)*
