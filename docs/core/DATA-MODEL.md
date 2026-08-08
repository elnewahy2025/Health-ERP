# Data Model — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Source of truth:** `packages/backend/migrations/`

---

## 1. Conventions

- **Identifiers:** UUID v4 (`generateId`), PK named `id`, FKs `*_id`.
- **Tenancy:** every business table has `tenant_id` referencing `tenants.id`; RLS enabled on tenant-scoped tables.
- **Audit fields:** `created_at`, `updated_at` on all tables; soft-delete via `deleted_at` where applicable.
- **Encryption:** sensitive patient fields encrypted at application layer with AES-256-GCM (see `shared/utils/crypto.ts`); encrypted values stored as `text` with `isEncrypted` marker where needed.
- **Migrations:** numbered `001`–`029`, idempotent where possible; run with `npm run migrate` (knex).

## 2. Core Entities (Migration 001)

| Entity | Purpose | Key fields |
|---|---|---|
| `tenants` | SaaS tenant root | name, status, plan, settings |
| `roles` | RBAC roles per tenant | name, permissions (jsonb) |
| `users` | Auth principal | email, password_hash, status, mfa flags, lockout fields |
| `branches` | Multi-branch org units | tenant_id, name, address, region |
| `patients` | Patient registry | MRN, national_id (encrypted), demographics, status |
| `appointments` | Scheduling | patient, branch, doctor, slot, status, type |
| `emr_records` | Clinical encounters | patient, encounter_type, vitals, notes |
| `invoices` | Billing | patient, branch, totals, status, ETA fields |
| `payment_transactions` | Payments | invoice, amount, method, status, gateway ref |
| `audit_logs` | Immutable audit trail | tenant, actor, action, entity, entity_id, before/after jsonb |

## 3. Domain Entity Map (all tables created by migrations)

The schema contains **~190 tables**. High-level groups:

| Group | Representative tables |
|---|---|
| Auth & tenancy | `tenants`, `roles`, `users`, `refresh_tokens`, `user_sessions`, `login_attempts`, `password_resets`, `otp_codes`, `tenant_subscriptions`, `subscription_plans`, `subscription_invoices`, `usage_records` |
| Patients & clinical | `patients`, `patient_allergies`, `patient_medications`, `patient_risk_scores`, `patient_messages`, `patient_shared_documents`, `emr_records`, `ai_clinical_notes`, `ai_diagnosis_suggestions`, `medication_database`, `lab_catalog`, `lab_tests`, `lab_orders`, `radiology_orders`, `nursing_notes`, `nursing_tasks`, `home_visits`, `referrals` |
| Scheduling | `appointments`, `appointment_reminders`, `booking_slots`, `booking_requests`, `queue_entries`, `queue_display_settings`, `kiosk_checkins`, `telemedicine_sessions`, `telemedicine_waiting_room`, `telemedicine_chat_messages` |
| Billing & finance | `invoices`, `invoice_items` (via `invoices`), `payment_transactions`, `eta_invoices`, `expenses`, `expense_categories`, `budget_plans`, `budget_line_items`, `business_associate_agreements`, `insurance_companies`, `insurance_claims`, `payroll_runs`, `payroll_entries`, `attendance` |
| Inventory & pharmacy | `inventory_items`, `inventory_transactions`, `warehouses`, `suppliers`, `purchase_orders`, `purchase_order_items`, `pharmacy_inventory`, `pharmacy_prescriptions`, `pharmacy_prescription_items`, `barcode_registry`, `barcode_templates`, `barcode_labels`, `barcode_scan_logs` |
| HR & operations | `employees`, `leave_requests`, `attendance`, `payroll_runs`, `payroll_entries`, `regions`, `branches` |
| CRM & marketing | `crm_campaigns`, `crm_patient_feedback`, `surveys`, `survey_responses` |
| Notifications & comms | `notifications`, `notification_templates`, `notification_preferences`, `notification_logs`, `chat_conversations`, `chat_messages`, `chat_participants`, `whatsapp_messages`, `whatsapp_templates`, `voice_calls`, `call_recordings` |
| Reports & BI | `reports`, `report_definitions`, `report_executions`, `report_schedules`, `dashboard_definitions`, `dashboard_widgets`, `dw_patient_stats`, `dw_appointment_stats`, `dw_revenue_stats`, `data_warehouse` (etl targets) |
| Compliance & security | `compliance_policies`, `compliance_audits`, `compliance_reports`, `data_retention_policies`, `data_consent_logs`, `breach_log`, `api_keys`, `api_key_logs`, `webhooks`, `webhook_logs`, `system_alerts`, `system_metrics`, `audit_logs` |
| Documents & templates | `documents`, `document_versions`, `print_templates`, `form_definitions`, `form_submissions`, `export_definitions`, `export_jobs`, `import_jobs`, `dr_configs`, `backup_configs`, `backup_executions` |
| AI | `ai_providers`, `ai_models`, `ai_requests`, `ai_cost_logs`, `ai_assistants`, `ai_predictions`, `ai_smart_schedules` |
| Platform | `tenant_branding`, `tenant_domains`, `tenant_data_residency`, `user_settings`, `user_preferences`, `cache_configs`, `integration_definitions`, `integration_connections`, `automation_rules`, `automation_rule_actions`, `automation_logs`, `automation_execution_logs`, `workflow_definitions`, `workflow_instances`, `session-manager` state |

## 4. Key Relationships

```
tenants 1─N roles, users, branches, patients, appointments, invoices, ...
users N─N roles (through user_roles in roles json or join table)
patients 1─N appointments, emr_records, invoices, prescriptions, lab_orders
appointments 1─N appointment_reminders; 1─N queue_entries
invoices 1─N payment_transactions; 1─1 eta_invoices
insurance_companies 1─N insurance_claims 1─N patients
```

## 5. Indexes & Constraints Highlights

- Unique partial indexes prevent duplicate active records (e.g., one active MRN per tenant, one active booking per slot).
- `pg_trgm` GIN indexes on patient name/MRN and medication/ICD-10 search columns.
- Appointment scheduling constraints (migration 024): no overlapping same-room/same-doctor slots.
- FK constraints with `ON DELETE CASCADE` only where ownership is clear (children of a parent aggregate); otherwise `RESTRICT`.

## 6. Migration Strategy

- Sequential numeric files; never edit an applied migration — add a new one.
- `knex migrate:latest` in CI and deploy; `npm run migrate` wrapper at repo root.
- Rollback: `knex migrate:rollback` (dev only); production rollbacks are release-managed.

## 7. Soft Delete & Audit

- Business records use `deleted_at` where user-facing deletion is expected; queries filter it.
- All writes go through audit service → `audit_logs` (actor, action, entity, before/after JSON).
- Data retention: `data_retention_policies` per entity; purge jobs respect retention windows.

## 8. Performance Considerations

- Tenant-scoped composite indexes: `(tenant_id, ...)` on hot paths.
- Pagination on list endpoints; no unbounded `SELECT`.
- Reporting reads use data-warehouse aggregation tables (`dw_*`) rather than OLTP tables.
- Backups: S3 with encryption (`BACKUP_ENCRYPTION_KEY`) and retention (`BACKUP_RETENTION`).

---

*Related: [Database Specification](../engineering/DATABASE-SPECIFICATION.md) · [Architecture](ARCHITECTURE.md)*
