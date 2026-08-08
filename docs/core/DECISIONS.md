# Decision Log (ADR) — Vision Healthcare ERP

**Rule:** Every architectural or technical decision must be recorded here with an ID.
New decisions are appended; existing entries are never rewritten.

---

## ADR-001: Monorepo with npm workspaces

- **Date:** 2026-05
- **Context:** Shared domain types, validators, and config must be consumed by backend and frontend without drift.
- **Decision:** npm workspaces with `packages/shared`, `packages/backend`, `packages/frontend`; `@healthcare/shared` published via workspace symlink + `exports` map; shared built to `dist/` before dependent builds.
- **Alternatives:** Lerna, pnpm workspaces, separate published npm package.
- **Trade-offs:** npm workspaces = zero extra tooling; symlink resolution requires shared `dist` to exist (build order enforced in `build` script and `prepare`).
- **Consequences:** New engineers must run `npm install` (runs `prepare` → builds shared) before building dependents.

## ADR-002: Fastify as the backend framework

- **Date:** 2026-05
- **Context:** Need high throughput, schema-first plugins, WebSocket support, and first-class TypeScript.
- **Decision:** Fastify 4 with plugin ecosystem (cors, helmet, rate-limit, jwt, swagger, multipart, websocket).
- **Alternatives:** Express, NestJS, Koa.
- **Trade-offs:** NestJS adds DI/ORM coupling; Express slower and less opinionated. Fastify keeps modules framework-agnostic (clean DI by composition).
- **Consequences:** Module registration via `registerXxxModule(app)`; dependency injection is manual constructor-style.

## ADR-003: Row-Level Security (RLS) for tenant isolation

- **Date:** 2026-06
- **Context:** Multi-tenant healthcare data demands strong isolation; application-level filters alone risk leakage.
- **Decision:** Enable RLS on tenant-scoped tables; application sets `app.current_tenant_id` per request; belt-and-braces with query filters.
- **Alternatives:** Separate database per tenant, schema-per-tenant.
- **Trade-offs:** RLS adds query-plan overhead and migration complexity; much cheaper ops than DB-per-tenant.
- **Consequences:** Migrations 023/027 enable RLS; any new tenant-scoped table must follow the pattern.

## ADR-004: AES-256-GCM application-layer encryption for sensitive fields

- **Date:** 2026-06
- **Context:** Egyptian National IDs and other PII must be protected even if DB is exfiltrated.
- **Decision:** Encrypt sensitive fields with AES-256-GCM using `ENCRYPTION_KEY`; deterministic search via hashed companion columns where needed.
- **Alternatives:** pgcrypto, column-level encryption, TDE.
- **Trade-offs:** App-layer encryption keeps data encrypted at rest in backups; requires key management and searchability trade-offs.
- **Consequences:** `shared/utils/crypto.ts` provides `encryptField/decryptField`; key rotation is an ops concern.

## ADR-005: Access JWT in memory + rotating refresh token in HttpOnly cookie

- **Date:** 2026-06
- **Context:** XSS resistance for a healthcare SPA; revocation on logout/compromise.
- **Decision:** Short-lived (15 min) access JWT held in memory; refresh token stored hashed in `refresh_tokens`, rotated on every use, delivered via HttpOnly cookie; session limits enforced.
- **Alternatives:** localStorage JWTs, opaque session IDs.
- **Trade-offs:** Loses persistence across reloads (re-login or silent refresh); much stronger XSS posture.
- **Consequences:** `refresh-token.ts` service + migrations 021/022 (rotation, auth hardening); frontend stores nothing sensitive in localStorage.

## ADR-006: TypeScript strict across monorepo + shared domain types

- **Date:** 2026-05
- **Context:** 57 modules and 82 pages must evolve without contract drift.
- **Decision:** Strict TS everywhere; domain types centralized in `@healthcare/shared/types`; Zod schemas at API boundary mirror types.
- **Alternatives:** Runtime-only validation (Joi), schema-first codegen (OpenAPI generators).
- **Trade-offs:** Some duplication between TS types and Zod schemas; codegen was heavier than the team wanted.
- **Consequences:** `npm run build` (tsc) is the primary integration test; CI gates on it.

## ADR-007: Knex + sequential migrations

- **Date:** 2026-05
- **Context:** Versioned schema evolution across local, CI, Docker, Railway.
- **Decision:** Knex with numbered migration files (001–029); no edits to applied migrations.
- **Alternatives:** Prisma, TypeORM, raw SQL scripts.
- **Trade-offs:** Knex is thin and SQL-transparent; Prisma adds schema DSL but heavier runtime coupling.
- **Consequences:** `npm run migrate` at root; schema truth lives in migrations (see DATA-MODEL.md).

## ADR-008: BullMQ on Redis for background jobs

- **Date:** 2026-06
- **Context:** Reminders, exports, AI calls, and backups must not block request threads.
- **Decision:** BullMQ queues keyed by job type; workers run in-process with Redis backend.
- **Alternatives:** RabbitMQ, SQS, cron-only.
- **Trade-offs:** Redis is already in the stack; BullMQ adds visibility (repeatable jobs, retries); SQS would add AWS coupling.
- **Consequences:** Queue consumers in services (`reminder.service.ts`, exports, AI, backups).

## ADR-009: TailwindCSS + shared UI kit on frontend

- **Date:** 2026-05
- **Context:** 82 pages need consistent, fast-to-build UI with RTL support.
- **Decision:** TailwindCSS utility classes; shared components in `components/ui` (Button, Modal, Input, Select, Badge, Table…); lucide-react icons; recharts for analytics.
- **Alternatives:** MUI, Ant Design, Chakra.
- **Trade-offs:** Utility CSS = smaller bundle and full theming control; loses pre-built accessible widgets (mitigated by ACCESSIBILITY.md guidelines).
- **Consequences:** DESIGN-SYSTEM.md documents tokens and component contracts.

## ADR-010: i18next with EN/AR and automatic RTL

- **Date:** 2026-06
- **Context:** Egyptian market requires Arabic and English.
- **Decision:** i18next + react-i18next; locale-driven `dir` switching; all UI strings externalized (2,676 keys).
- **Alternatives:** react-intl, custom dictionary.
- **Trade-offs:** i18next is mature and tree-shakable; pluralization handled via ICU.
- **Consequences:** New UI strings must be added to both `en.json` and `ar.json` (CONTENT-GUIDELINES.md).

## ADR-011: Docker-first deployment with non-root containers

- **Date:** 2026-06
- **Context:** Reproducible deploy on self-host and managed platforms; security hardening.
- **Decision:** Multi-stage Dockerfiles (node:20-alpine), non-root `appuser:1001`, health checks, `docker-compose.prod.yml` with nginx.
- **Alternatives:** Bare VM deploys, Kubernetes.
- **Trade-offs:** Compose is simple but not k8s-scale; Railway Nixpacks path covers managed hosting.
- **Consequences:** DEPLOYMENT.md documents both paths.

## ADR-012: pino structured logging with redaction

- **Date:** 2026-06
- **Context:** Compliance requires no PII/tokens in logs.
- **Decision:** pino + pino-http with redaction paths for secrets, tokens, passwords, and NID fields.
- **Alternatives:** Winston, morgan.
- **Trade-offs:** pino is fastest; redaction config must be maintained as fields evolve.
- **Consequences:** `LOG_LEVEL` env; audit events go to DB, not logs.

## ADR-013: AI provider abstraction with cost logging and fallback

- **Date:** 2026-06
- **Context:** Clinical AI must never block care; provider choice must be swappable; costs trackable.
- **Decision:** `ai_providers`/`ai_models` config tables + provider abstraction in `ai-intelligence`; every request logged to `ai_cost_logs`; `AI_PROVIDER=none` yields rule-based fallback.
- **Alternatives:** Direct vendor SDKs.
- **Trade-offs:** Abstraction adds indirection; keeps the product vendor-neutral.
- **Consequences:** AI docs (`docs/ai/`) detail prompt engineering and guardrails.

## ADR-014: TypeScript incremental build caches never committed

- **Date:** 2026-07
- **Context:** Committed `tsconfig.tsbuildinfo` caused stale incremental builds on fresh clones (shared `dist` incomplete → TS2307).
- **Decision:** `*.tsbuildinfo` added to `.gitignore`; files removed from git history tracking; builds always start from a clean cache on fresh clones.
- **Alternatives:** Disable composite/incremental (rejected: CI build-time benefit), clean in postinstall.
- **Trade-offs:** Slightly slower incremental rebuilds locally after clone; correctness wins.
- **Consequences:** See `docs/engineering/DEPLOYMENT.md` troubleshooting; CI does not restore buildinfo caches.

## ADR-015: Frontend test peer dependency `@testing-library/dom` declared explicitly

- **Date:** 2026-07
- **Context:** `@testing-library/react@16` requires `@testing-library/dom` as peer; hoisting hid the missing dependency, causing TS2305 on `screen`/`waitFor`.
- **Decision:** Declare `@testing-library/dom@^10.4.1` in frontend devDependencies.
- **Alternatives:** Rely on hoisted transitive install (rejected: fragile, broke CI/typecheck).
- **Trade-offs:** Explicit dependency = one more package to keep in sync; deterministic installs.
- **Consequences:** `npm ci` from lockfile always includes the peer; typecheck passes.

---

*Related: [Checkpoint](CHECKPOINT.md) · [Risk register](../project-management/RISK-REGISTER.md)*
