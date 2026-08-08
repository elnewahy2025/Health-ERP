# Product Requirements Document — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Owner:** Product Management

---

## 1. Problem Statement

Egyptian healthcare providers (clinics, polyclinics, multi-branch groups, and hospitals)
manage patient records, appointments, billing, inventory, HR, and compliance using
disconnected tools (paper, spreadsheets, siloed apps). This causes:

- Fragmented patient data and medical errors
- Revenue leakage from missed billable items and uncollected claims
- Compliance risk with Egyptian tax (ETA e-invoicing) and data-protection requirements
- Poor patient experience (long queues, no self-service, no appointment reminders)
- No visibility for management (no dashboards, no BI)

**Vision:** A single multi-tenant, cloud-native SaaS platform covering the full patient
lifecycle — from first appointment through billing, insurance claims, and follow-up —
built for the Egyptian market, in English and Arabic.

## 2. Goals & Non-Goals

### Goals
- G1: Unified patient registry with legal Egyptian National ID validation and encryption
- G2: End-to-end appointment lifecycle (booking → reminders → check-in → queue)
- G3: Clinical documentation (EMR) with prescriptions, labs, radiology, nursing
- G4: Billing with invoices, payments, ETA e-invoice submission, Fawry/InstaPay
- G5: Multi-branch, multi-tenant operation with white-label and subscription billing
- G6: Compliance (Egyptian market + OWASP security baseline)
- G7: Bilingual (EN/AR) with RTL, accessible on desktop and mobile browsers

### Non-Goals (current release)
- Native iOS/Android apps (mobile-web PWA scope only)
- Full hospital administration (bed management, surgical scheduling)
- Offline-first sync for rural clinics
- Multi-country regulatory coverage beyond Egypt

## 3. Personas

| Persona | Description | Primary needs |
|---|---|---|
| Clinic Admin | Runs the practice | Dashboards, staff, billing, reports |
| Receptionist | Books appointments, checks patients in | Fast scheduling, queue display |
| Physician | Documents encounters, prescribes | Fast EMR, order entry, history |
| Nurse | Triage, vitals, nursing tasks | Task list, vitals entry |
| Pharmacist | Dispenses prescriptions, stocks | Pharmacy queue, inventory |
| Accountant | Invoices, payments, tax | Billing, ETA e-invoice, reports |
| HR Manager | Staff, payroll, attendance | Employee records, payroll |
| Patient | Receives care | Booking, reminders, portal, self-service |
| Tenant Owner | SaaS customer | White-label, users, subscriptions |
| Platform Admin | Operates the SaaS | Tenant mgmt, system monitor, AI usage |

## 4. Functional Requirements (High-level)

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Tenant registration & on-boarding with isolated data (RLS) | P0 |
| FR-2 | RBAC with roles/permissions per tenant | P0 |
| FR-3 | Secure auth: JWT + refresh rotation, MFA/TOTP, OTP, lockout | P0 |
| FR-4 | Patient CRUD with Egyptian NID validation & AES-256-GCM encryption | P0 |
| FR-5 | Appointment booking, rescheduling, cancel, reminders, no-show tracking | P0 |
| FR-6 | EMR: encounters, vitals, diagnoses (ICD-10), procedures, medications | P0 |
| FR-7 | Lab, radiology, pharmacy, nursing, home-visit order workflows | P0 |
| FR-8 | Billing: invoices, payments, refunds, ETA e-invoice, Fawry/InstaPay | P0 |
| FR-9 | Inventory: items, warehouses, purchase orders, stock transactions | P0 |
| FR-10 | Insurance companies, policies, claims lifecycle | P1 |
| FR-11 | HR: employees, attendance, leave, payroll | P1 |
| FR-12 | CRM: campaigns, feedback, referral network | P1 |
| FR-13 | Notifications: templates, channels (email/SMS/WhatsApp), logs | P0 |
| FR-14 | Reports & BI dashboards with scheduled exports | P1 |
| FR-15 | Compliance: policies, audits, data retention, DR backup | P1 |
| FR-16 | Integrations: webhooks, API keys, WhatsApp Business, Twilio, SendGrid, Supabase, Stripe | P2 |
| FR-17 | AI: clinical notes, diagnosis suggestions, risk scores, smart scheduling, predictions | P2 |
| FR-18 | Patient self-service: portal, online booking, messaging, surveys | P1 |
| FR-19 | Multi-branch, regions, white-label branding, custom domains | P1 |
| FR-20 | System monitor, audit logs, data export/import, print templates | P1 |

## 5. Non-Functional Requirements

| NFR | Target |
|---|---|
| Performance | API p95 < 300 ms (excluding media); page load < 2.5 s on broadband |
| Availability | 99.9% target; health-checked containers; restart policies |
| Scalability | Stateless backend (Fastify) horizontally scalable; Redis for sessions/queues |
| Security | OWASP Top 10 mitigated (see `engineering/SECURITY.md`); TLS; secrets via env/Docker secrets |
| Data integrity | All mutations in transactions; unique partial indexes; FK constraints |
| Auditability | Every write audited via `audit_logs` (service + module-level) |
| Compliance | Egyptian data protection; ETA e-invoice schema; retention policies |
| i18n | 100% UI strings externalized; EN + AR; RTL support |
| Accessibility | WCAG 2.1 AA target (see `product/ACCESSIBILITY.md`) |
| Observability | Structured pino logs with redaction; system metrics; Sentry optional |
| Testability | Unit + integration (Vitest), e2e (Playwright), CI on GitHub Actions |

## 6. Scope Boundaries

- **In scope:** Web application (desktop + mobile responsive), backend REST/WebSocket APIs,
  PostgreSQL schema + migrations, infra (Docker Compose), CI/CD, docs.
- **Out of scope:** Native apps, offline-first, billing in currencies other than EGP (currently),
  modules requiring third-party contracts (activated via env config only).

## 7. Assumptions

1. PostgreSQL 15, Redis 7, and MinIO are provided by the deployment platform (Docker Compose locally).
2. Third-party providers (Twilio, SendGrid, WhatsApp, Fawry, InstaPay, Stripe) are optional;
   the system degrades gracefully when not configured (`AI_PROVIDER=none`, empty SMTP, etc.).
3. Default JWT access-token lifetime is 15 minutes with refresh rotation.
4. The deployment target supports both Docker Compose (self-host) and Railway (Nixpacks).
5. All identifiers are UUID v4 generated server-side; MRNs and invoice numbers are sequential-safe formatted strings.

## 8. Success Metrics

- Time-to-first-appointment < 60 s for receptionist
- % appointments with reminders sent > 90%
- % invoices submitted to ETA (when enabled) > 95%
- Zero unresolved critical security findings (audit: `docs/FINAL_AUDIT_REPORT.md`)
- Build passes on `main` for 100% of pushes (CI gate)

---

*Related: [Product Specification](PRODUCT-SPECIFICATION.md) · [Roadmap](../core/ROADMAP.md)*
