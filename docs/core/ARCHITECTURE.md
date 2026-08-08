# Architecture — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Depends on:** TECHNICAL-SPECIFICATION.md

---

## 1. Architectural Style

Clean Architecture at the module level, applied pragmatically:

- **Core modules** (auth, patient, appointment, inventory) follow strict layering:
  `types → schema → repository → service → controller → routes → index(register)`.
- **Feature modules** use a lighter single-file controller/service split where the
  domain does not justify full decomposition (documented per module in `docs/modules/`).
- **Dependencies point inward**: modules depend on `@healthcare/shared` (domain types,
  errors, middleware), never the reverse. Frontend depends on backend API contracts and shared types only.

## 2. High-Level Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        Frontend (SPA)                          │
│  React 18 + Vite · 82 lazy pages · React Query · i18n (EN/AR)  │
│  lib/api (typed clients) → fetch /api/v1 · stores · sanitize   │
└──────────────────────────────┬─────────────────────────────────┘
                               │ HTTPS /api/v1 + WS
┌──────────────────────────────▼─────────────────────────────────┐
│                Nginx (SSL, rate limit, headers)                │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│                    Backend (Fastify 4)                         │
│  plugins: cors, cookie, helmet, rate-limit, jwt, swagger,      │
│           multipart, websocket                                 │
│  core: database (Knex), redis, error-handler, versioning       │
│  modules: 57 feature modules (registerXxxModule)               │
│  services: audit, email, sms, whatsapp, otp, totp, pdf,        │
│            storage, payment, chat, voice, reminder, sentry     │
│  jobs: BullMQ queues (reminders, exports, AI, backups)         │
└───────┬──────────────────────────────┬─────────────────┬───────┘
        │                              │                 │
┌───────▼────────┐      ┌──────────────▼─────┐   ┌───────▼──────┐
│ PostgreSQL 15  │      │ Redis 7           │   │ MinIO/S3     │
│ RLS · pg_trgm  │      │ sessions·queues·  │   │ documents·   │
│ AES-256-GCM at │      │ rate limits       │   │ backups      │
│ app layer      │      └───────────────────┘   └──────────────┘
└────────────────┘
```

## 3. Runtime Topology

- **Local dev:** `docker compose up -d postgres redis minio` + `npm run dev`
  (concurrently runs backend on :3000, frontend on :5173; shared built via `prepare`).
- **Docker full stack:** `docker-compose.prod.yml` runs postgres, redis, minio, backend,
  frontend (nginx), and backup containers with health checks and non-root users.
- **Railway:** Nixpacks build `shared` → `backend`; start `node dist/index.js`.
- **Vercel:** frontend-only scope (`vercel.json`).

## 4. Key Data Flows

### 4.1 Authentication Flow
1. Frontend posts `/api/v1/auth/login` → backend verifies bcrypt hash, checks lockout/login_attempts.
2. Issues access JWT (15 min) + refresh token stored in DB (`refresh_tokens`, rotated on use) and set as HttpOnly cookie.
3. Frontend keeps access token in memory only (XSS mitigation); React Query attaches `Authorization: Bearer`.
4. Refresh flow: `POST /api/v1/auth/refresh` rotates refresh token; sessions tracked in `user_sessions`.

### 4.2 Tenant Isolation (RLS)
1. `tenants` table is the root of the hierarchy; every business table carries `tenant_id`.
2. RLS policies are enabled on tenant-scoped tables (migrations 023/027); requests set `app.current_tenant_id`.
3. Application validates the tenant from the JWT before executing queries; `hasPermission` guards actions.

### 4.3 Appointment → Reminder → Notification
1. `appointment` module creates/updates `appointments` in a transaction.
2. BullMQ enqueues reminder jobs; `reminder.service` resolves patient contact and channel preferences.
3. `notification` service renders template and dispatches via email/SMS/WhatsApp; result recorded in `notification_logs`.

### 4.4 Billing → ETA → Payments
1. Invoice created in `invoices` + `invoice_items`; status transitions audited.
2. ETA submission writes `eta_invoices` with UUID; QR generation; webhook callbacks via `webhook_logs`.
3. Payments recorded in `payment_transactions`; Fawry/InstaPay adapters invoked when configured.

### 4.5 AI Clinical Support
1. `ai-hub` / `ai-intelligence` modules accept clinical text → validate input → call provider via abstraction.
2. Responses are cached/guarded, logged to `ai_cost_logs`, and written to `ai_clinical_notes` / suggestions.
3. If provider is unavailable or `AI_PROVIDER=none`, fallback returns deterministic rule-based results (never blocks care).

## 5. Security Architecture (summary)

- **Perimeter:** Nginx security headers (HSTS, CSP, X-Frame-Options, Permissions-Policy), TLS.
- **Transport:** HTTPS; WSS for websockets.
- **Identity:** JWT access (memory) + rotating refresh (HttpOnly cookie), MFA/TOTP, OTP, lockout.
- **Data:** RLS + AES-256-GCM encryption at app layer; parameterized queries; sanitization.
- **Ops:** Docker secrets / env files, non-root containers, redacted logging, audit trail, DR backups.

Full detail: `engineering/SECURITY.md`.

## 6. Cross-Cutting Concerns

| Concern | Mechanism |
|---|---|
| Error handling | `core/error-handler.ts` + `@healthcare/shared/errors` |
| Validation | Zod schemas at route boundary (`*.schema.ts`) |
| Authorization | `auth-guard.ts`, `authorize-guard.ts`, `hasPermission` |
| Rate limiting | `utils/rate-limiter.ts` per endpoint |
| Logging | pino + pino-http, redaction |
| Audit | `services/audit.ts` → `audit_logs` |
| Versioning | `core/versioning`; `/api/v1` prefix |
| Configuration | `@healthcare/shared/config` (`getEnv`) with validation |

## 7. Evolution & Extensibility

- New module = new folder under `modules/` + `registerXxxModule` in `index.ts`; docs required per `docs/modules/`.
- New shared domain type = extend `@healthcare/shared/src/types`; build `shared` first.
- New integration = adapter behind existing service interface (email/sms/payment/storage).
- Scaling: add backend replicas behind Nginx; scale queues with BullMQ workers; use read replicas for reporting.

---

*Related: [Data Model](DATA-MODEL.md) · [Deployment](../engineering/DEPLOYMENT.md) · [Decision log](DECISIONS.md)*
