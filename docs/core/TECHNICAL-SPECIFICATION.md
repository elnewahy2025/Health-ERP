# Technical Specification — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Depends on:** PRODUCT-SPECIFICATION.md

---

## 1. System Overview

Monorepo (npm workspaces) with three packages:

| Package | Role | Key tech |
|---|---|---|
| `@healthcare/shared` | Shared types, constants, env config, crypto, validators, formatters, errors, i18n, permission middleware | TypeScript, no runtime deps |
| `@healthcare/backend` | REST + WebSocket API, business logic, workers | Fastify 4, Knex, Zod, BullMQ, pino |
| `@healthcare/frontend` | SPA | React 18, Vite 5, TailwindCSS, React Query, react-hook-form, zod, i18next, recharts |

Cross-cutting infra: PostgreSQL 15, Redis 7, MinIO (S3), optional Elasticsearch, Nginx.

## 2. Technology Choices & Rationale

| Choice | Rationale |
|---|---|
| Fastify 4 | High-performance, schema-first plugins (cors, helmet, rate-limit, jwt, swagger, multipart, websocket) |
| TypeScript strict | Type safety across monorepo; shared domain types prevent drift |
| Knex + migrations | Versioned SQL schema, cross-env migrations, transaction support |
| Zod | Runtime validation shared between API boundary and forms |
| React Query | Server-state caching, optimistic updates, invalidation |
| BullMQ | Background jobs (reminders, exports, AI, backups) via Redis |
| pino | Structured JSON logs with redaction |
| MinIO | S3-compatible document storage with tenant isolation |
| Docker Compose | Reproducible local + production stack (non-root, health checks) |

## 3. Module Boundaries

- **Backend modules** are registered in `packages/backend/src/index.ts` via
  `registerXxxModule(app)`; Clean Architecture pattern for core modules:
  `*.types.ts → *.schema.ts → *.repository.ts → *.service.ts → *.controller.ts → *.routes.ts`.
- **Shared package** exposes domain types, `getEnv()`, crypto/validators/formatters,
  `AppError` hierarchy, `hasPermission` middleware, and `translations`.
- **Frontend** structure: `pages/`, `components/` (`ui`, `layout`, `features`, `patient-portal`, `analytics`),
  `lib/api/` (typed clients per domain), `lib/query/` (hooks), `stores/`, `router/`, `i18n/`.

## 4. API Design

- Base path: `/api/v1`
- Authentication: Bearer access token (15 min) + HttpOnly refresh cookie with rotation
- Response envelope: `{ success, data, meta? }` (see `utils/response.ts`)
- Errors: `AppError` hierarchy → JSON `{ success: false, error: { code, message, details? } }`
- OpenAPI via `@fastify/swagger` + swagger-ui at `/docs` (dev)
- WebSockets: `@fastify/websocket` for chat, telemedicine waiting room, queue display, voice calls

## 5. Data Layer

- PostgreSQL 15 with Row-Level Security (RLS) for tenant isolation
- Migrations in `packages/backend/migrations/` (001–029), executed with `npm run migrate`
- Knex query builder; raw SQL only where necessary (RLS policies, indexes)
- Encryption at application layer: AES-256-GCM (`shared/utils/crypto.ts`) for sensitive fields
- Soft delete policy: audit-aware; hard deletes restricted to admin maintenance scripts
- Search: `pg_trgm` GIN indexes for patients, medications, ICD-10

## 6. Background Processing

| Queue (BullMQ) | Purpose | Trigger |
|---|---|---|
| Appointment reminders | Email/SMS/WhatsApp reminders | On booking + schedule |
| Notification dispatch | Template rendering + channel send | Service call |
| Report executions | Scheduled report generation | Cron/schedule |
| Data exports | Async export jobs | User request |
| AI requests | Provider calls, cost logging | Clinical AI features |
| Backups | DR backups to S3 | Schedule |
| Automation rules | Rule engine actions | Event |

## 7. Integration Points

| Integration | Mode | Config |
|---|---|---|
| SMTP / SendGrid | Email | `SMTP_*`, `SENDGRID_API_KEY` |
| Twilio | SMS + voice | `TWILIO_*` |
| WhatsApp Business API | Messaging | `WHATSAPP_*` |
| Fawry | Payments | `FAWRY_*` |
| InstaPay | Payments | `INSTAPAY_WALLET` |
| Stripe | SaaS subscriptions | `STRIPE_*` |
| Supabase Storage | Documents | `SUPABASE_*` |
| Sentry | Error monitoring | `SENTRY_DSN` |
| MinIO / S3 | Documents + backups | `MINIO_*`, `BACKUP_S3_*` |

All integrations are optional; missing credentials degrade gracefully.

## 8. Observability

- pino structured logs, `LOG_LEVEL` configurable; pino-http request logging with redaction
- `system_alerts`, `system_metrics`, `webhook_logs`, `audit_logs`
- Health endpoint (`/health`) used by Docker healthchecks
- Sentry optional for backend errors

## 9. Performance & Scalability

- Stateless backend → horizontal scaling behind Nginx
- Redis: sessions, rate limits, queues, cache
- Pagination (`PAGINATION` constants) on all list endpoints
- DB indexes on FKs, tenant-scoped columns, and search columns
- Frontend: code-splitting, lazy-loaded routes, React Query caching

## 10. Compatibility & Constraints

- Node.js >= 20 (Dockerfiles pin node:20-alpine)
- PostgreSQL >= 15 (RLS, pg_trgm)
- Redis >= 7
- Browser support: modern evergreen browsers (Chrome, Edge, Firefox, Safari)
- RTL: `dir="rtl"` toggling via i18n locale

---

*Related: [Architecture](ARCHITECTURE.md) · [API Specification](../engineering/API-SPECIFICATION.md) · [Database Specification](../engineering/DATABASE-SPECIFICATION.md)*
