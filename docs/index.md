# Vision Healthcare ERP — Documentation Index

**Documentation package for the Vision Healthcare ERP platform.**
This is the single source of truth for all product, engineering, security, and operational decisions.
Every document below contains production-quality content derived from the actual codebase
(`packages/`, `migrations/`, `docker-compose*.yml`, `.github/workflows/`, `docs/`).

> **Documentation standard:** No placeholders. Every document is complete and internally consistent.
> Decisions are recorded in `DECISIONS.md` and must never contradict each other.

---

## 1. Core Documentation

| Document | Purpose |
|---|---|
| [README](../README.md) | Project overview, quick start, Windows/Linux setup |
| [PRODUCT-REQUIREMENTS.md](core/PRODUCT-REQUIREMENTS.md) | Problem statement, personas, functional/non-functional requirements, scope |
| [PRODUCT-SPECIFICATION.md](core/PRODUCT-SPECIFICATION.md) | Feature specifications, user stories, acceptance criteria |
| [TECHNICAL-SPECIFICATION.md](core/TECHNICAL-SPECIFICATION.md) | System design, technologies, integration points |
| [ARCHITECTURE.md](core/ARCHITECTURE.md) | Architectural overview, clean architecture, data flows |
| [DATA-MODEL.md](core/DATA-MODEL.md) | Entity model, relationships, conventions |
| [IMPLEMENTATION-PLAN.md](core/IMPLEMENTATION-PLAN.md) | Phases, milestones, deliverables, definition of done |
| [DECISIONS.md](core/DECISIONS.md) | Decision log (ADR) — every architectural decision |
| [ROADMAP.md](core/ROADMAP.md) | Short/mid/long-term roadmap |
| [CHECKPOINT.md](core/CHECKPOINT.md) | Current phase, completed/pending work, blockers |

## 2. Engineering Documentation

| Document | Purpose |
|---|---|
| [API-SPECIFICATION.md](engineering/API-SPECIFICATION.md) | REST API contract, auth, versioning, examples |
| [DATABASE-SPECIFICATION.md](engineering/DATABASE-SPECIFICATION.md) | Schema, constraints, indexes, migration policy |
| [SECURITY.md](engineering/SECURITY.md) | Security architecture, OWASP Top 10, secrets, backup/DR |
| [AUTHORIZATION.md](engineering/AUTHORIZATION.md) | User Management, RBAC & authorization system — decisions, matrix, enforcement architecture, phases |
| [TESTING.md](engineering/TESTING.md) | Test strategy, coverage, environments |
| [DEPLOYMENT.md](engineering/DEPLOYMENT.md) | Environments, CI/CD, containers, rollback, scaling |
| [ENVIRONMENT.md](engineering/ENVIRONMENT.md) | Infrastructure topology and services |
| [CONFIGURATION.md](engineering/CONFIGURATION.md) | Environment variables and configuration management |
| [STYLEGUIDE.md](engineering/STYLEGUIDE.md) | Code style, TypeScript conventions, lint/format |
| [CONTRIBUTING.md](engineering/CONTRIBUTING.md) | Contribution workflow, code conventions |

## 3. Product Documentation

| Document | Purpose |
|---|---|
| [UX-SPECIFICATION.md](product/UX-SPECIFICATION.md) | User flows, layout, RTL, interaction patterns |
| [DESIGN-SYSTEM.md](product/DESIGN-SYSTEM.md) | Components, tokens, theming |
| [CONTENT-GUIDELINES.md](product/CONTENT-GUIDELINES.md) | Copy, i18n (EN/AR), tone |
| [ACCESSIBILITY.md](product/ACCESSIBILITY.md) | WCAG compliance, RTL accessibility |
| [ANALYTICS.md](product/ANALYTICS.md) | Product analytics, BI, telemetry |
| [SEO.md](product/SEO.md) | Web SEO strategy |

## 4. Project Management Documentation

| Document | Purpose |
|---|---|
| [RELEASE-PLAN.md](project-management/RELEASE-PLAN.md) | Release cadence and checklists |
| [VERSIONING.md](project-management/VERSIONING.md) | Versioning policy |
| [RISK-REGISTER.md](project-management/RISK-REGISTER.md) | Risk assessment and mitigation |
| [ISSUE-TEMPLATE.md](project-management/ISSUE-TEMPLATE.md) | Issue/PR templates |
| [BUG-TRIAGE.md](project-management/BUG-TRIAGE.md) | Bug triage severity and SLA |
| [RETROSPECTIVE.md](project-management/RETROSPECTIVE.md) | Retrospective process and history |

## 5. AI Documentation

| Document | Purpose |
|---|---|
| [AI-INSTRUCTIONS.md](ai/AI-INSTRUCTIONS.md) | AI system architecture, prompt engineering, guardrails |
| [PROJECT-CONTEXT.md](ai/PROJECT-CONTEXT.md) | Project context for AI agents |
| [READING-MAP.md](ai/READING-MAP.md) | Navigation map for AI agents |
| [EXECUTION-RULES.md](ai/EXECUTION-RULES.md) | Rules AI agents must follow |
| [PHASE-CHECKPOINTS.md](ai/PHASE-CHECKPOINTS.md) | AI-assisted phase checkpoints |

## 6. Module Documentation

| Document | Module |
|---|---|
| [Module index](modules/README.md) | All 57 modules + map |
| [auth.md](modules/auth.md) | Authentication, tenants, sessions, MFA |
| [patient.md](modules/patient.md) | Patient registry, lifecycle, encryption, RLS |
| [appointment.md](modules/appointment.md) | Scheduling, reminders, booking |
| [emr.md](modules/emr.md) | Clinical records, encounters, prescriptions |
| [billing.md](modules/billing.md) | Invoices, payments, ETA e-invoicing |
| [inventory.md](modules/inventory.md) | Items, stock, purchase orders, warehouses |
| [hr.md](modules/hr.md) | Employees, attendance, payroll, leave |
| [crm.md](modules/crm.md) | Campaigns, feedback, pipeline |
| [notification.md](modules/notification.md) | Notifications, templates, channels |
| [reports.md](modules/reports.md) | Report builder, schedules, exports |
| [bi.md](modules/bi.md) | Dashboards, widgets, analytics |
| [compliance.md](modules/compliance.md) | Policies, audits, retention |
| [integrations.md](modules/integrations.md) | Webhooks, API keys, connectors |
| [saas-billing.md](modules/saas-billing.md) | Subscriptions, plans, usage metering |
| [white-label.md](modules/white-label.md) | Tenant branding, custom domains |

---

**Maintenance rule:** Whenever code changes, update the corresponding module doc and
`CHECKPOINT.md`. Decisions must be appended to `DECISIONS.md` with an ADR entry.
