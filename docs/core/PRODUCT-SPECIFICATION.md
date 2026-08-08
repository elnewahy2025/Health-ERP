# Product Specification — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Depends on:** PRODUCT-REQUIREMENTS.md

This document specifies each product area as user stories with acceptance criteria.
All features are implemented (verified against `packages/backend/src/modules` and
`packages/frontend/src/pages`).

---

## 1. Authentication & Tenancy

| Story | Acceptance Criteria |
|---|---|
| As a user, I can register a new tenant | Tenant + admin user created; tenant status `active`; email verification flow available |
| As a user, I can log in with email + password | 5-failed-attempt lockout; refresh token rotation; concurrent session limit |
| As a user, I can enable MFA | TOTP setup/verify via `mfa/setup`, `mfa/enable`, `mfa/disable`; OTP via `otp/send`, `otp/verify` |
| As a user, I can recover my password | `forgot-password` (rate-limited), `reset-password` with token hash; password strength policy |
| As a user, I can manage sessions | List/revoke sessions; max concurrent sessions enforced |

**Frontend pages:** `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `SessionsPage`, `SecuritySettingsPage`.

## 2. Patient Registry

| Story | Acceptance Criteria |
|---|---|
| As reception/admin, I can create a patient | Egyptian NID validated (checksum, governorate, birth date, gender); sensitive fields encrypted (AES-256-GCM); MRN auto-generated |
| As staff, I can view patient timeline | Timeline merges appointments, EMR, billing, labs, prescriptions (`PatientTimelinePage`) |
| As staff, I can search patients | `pg_trgm` search indexes; paginated API |

## 3. Appointment & Queue

| Story | Acceptance Criteria |
|---|---|
| As receptionist, I can book/reschedule/cancel | Conflict constraints (`appointment_scheduling_constraints` migration); reminder scheduling |
| As patient, I can self-book | `online-booking` slots with availability; `booking_requests` |
| As clinic, I can run a queue | `queue_entries` + `queue_display_settings`; kiosk check-in (`KioskCheckinPage`) |
| Smart scheduling | AI suggests optimal slots (`ai_smart_schedules`) |

## 4. Clinical (EMR, Lab, Radiology, Pharmacy, Nursing)

| Story | Acceptance Criteria |
|---|---|
| As physician, I can document an encounter | Encounter types, vitals, diagnoses (ICD-10), procedures, medications; AI clinical note assistance |
| As physician, I can order labs/imaging | Orders routed to lab/radiology modules with results status |
| As pharmacist, I can dispense | Prescription validation, pharmacy inventory decrement, barcode support |
| As nurse, I can record tasks/vitals | Nursing tasks and notes; vitals captured in EMR |

## 5. Billing & Payments

| Story | Acceptance Criteria |
|---|---|
| As accountant, I can invoice | Invoice items with EGP formatting; statuses; payment transactions; refunds |
| As accountant, I can submit ETA e-invoices | `eta_invoices` table, QR code, UUID tracking |
| As cashier, I can take payments | Fawry / InstaPay / cash / card; payment gateway adapters optional via env |

## 6. Inventory & Procurement

| Story | Acceptance Criteria |
|---|---|
| As storekeeper, I can manage items | Items, warehouses, stock levels, reorder alerts |
| As purchaser, I can create POs | `purchase_orders` + `purchase_order_items` with supplier records |
| Stock movements | `inventory_transactions` ledger; pharmacy-specific `pharmacy_inventory` |

## 7. HR

| Story | Acceptance Criteria |
|---|---|
| As HR manager, I can manage employees | Employee records, attendance, leave requests, payroll runs/entries |

## 8. Notifications & Communications

| Story | Acceptance Criteria |
|---|---|
| As admin, I can send notifications | Templates (`notification_templates`), preferences, multi-channel (email/SMS/WhatsApp), logs |
| Advanced communication | Chat (`chat_conversations`), voice calls, WhatsApp templates/messages |

## 9. Reports & BI

| Story | Acceptance Criteria |
|---|---|
| As manager, I can build reports | `report_definitions`, scheduled `report_executions`, exports |
| As manager, I can view dashboards | `dashboard_definitions` + `dashboard_widgets`; BI pages; data warehouse tables (`dw_*`) |

## 10. Compliance, Audit & DR

| Story | Acceptance Criteria |
|---|---|
| As compliance officer, I can manage policies | Policies, compliance audits, reports |
| Everything auditable | `audit_logs` with actor, action, entity, tenant |
| DR | `dr-configs`/`backup_executions`, S3 backup with encryption and retention |

## 11. SaaS Platform

| Story | Acceptance Criteria |
|---|---|
| As tenant owner, I can subscribe | `tenant_subscriptions`, `subscription_plans`, `subscription_invoices`, `usage_records` |
| As tenant owner, I can white-label | `tenant_branding`, `tenant_domains`; custom domain serving |
| As platform admin, I can monitor | `system_monitor` metrics, alerts; API keys + `api_key_logs` |

## 12. AI Features (P2)

| Story | Acceptance Criteria |
|---|---|
| Clinical AI | `ai_clinical_notes`, `ai_diagnosis_suggestions`, `ai_predictions`, risk scores |
| AI cost control | `ai_cost_logs` per request; provider abstraction (`ai_providers`, `ai_models`) |
| Prompt safety | Guardrails, fallback when provider unavailable (`AI_PROVIDER=none`) |

---

## Feature Inventory (verified)

- Backend modules: **57** (`packages/backend/src/modules`)
- Frontend pages: **82** (`packages/frontend/src/pages`)
- Database migrations: **29** (`packages/backend/migrations`)
- i18n keys: **2,676** (`packages/frontend/src/i18n/en.json`)
- API route registrations: **60+ route files**, ~360 endpoints under `/api/v1`
- Backend tests: **20 files / 154 tests**; e2e: **3 Playwright specs**

*Related: [Technical Specification](TECHNICAL-SPECIFICATION.md) · [Data Model](DATA-MODEL.md)*
