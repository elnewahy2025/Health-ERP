# Reading Map — Vision Healthcare ERP (for AI Agents)

**Purpose:** A decision tree that tells agents which documents/files to read for a given task.

---

## 1. Task → Document Map

| If you need to… | Read first | Then |
|---|---|---|
| Understand the product | `docs/core/PRODUCT-REQUIREMENTS.md`, `PRODUCT-SPECIFICATION.md` | UX spec |
| Change architecture | `docs/core/ARCHITECTURE.md`, `TECHNICAL-SPECIFICATION.md` | DECISIONS.md |
| Add a DB table/migration | `docs/engineering/DATABASE-SPECIFICATION.md`, `DATA-MODEL.md` | existing migrations |
| Add/change an API endpoint | `docs/engineering/API-SPECIFICATION.md` | a module `*.routes.ts` example |
| Add a backend module | `docs/modules/README.md` + a Clean Architecture module (auth) | CONTRIBUTING.md |
| Add a frontend page | `docs/product/DESIGN-SYSTEM.md`, `UX-SPECIFICATION.md` | `packages/frontend/src/pages/*` example |
| Change env vars | `docs/engineering/CONFIGURATION.md` | `packages/shared/src/config/environment.ts` |
| Fix a security issue | `docs/engineering/SECURITY.md` + `docs/security/*` | FINAL_AUDIT_REPORT.md |
| Write tests | `docs/engineering/TESTING.md` | existing `__tests__` |
| Deploy / debug infra | `docs/engineering/DEPLOYMENT.md`, `ENVIRONMENT.md` | docker-compose files |
| Work on AI features | `docs/ai/AI-INSTRUCTIONS.md` | `packages/backend/src/modules/ai-*` |
| Release a version | `docs/project-management/RELEASE-PLAN.md` | VERSIONING.md |
| Triaging a bug | `docs/project-management/BUG-TRIAGE.md` | ISSUE-TEMPLATE.md |
| Know what's in progress | `docs/core/CHECKPOINT.md`, `ROADMAP.md` | git log |

## 2. Code Reading Order (new engineer)

1. `packages/shared/src/index.ts` — what the domain shares.
2. `packages/backend/src/index.ts` — how modules register.
3. `packages/backend/src/modules/auth/*` — Clean Architecture reference.
4. `packages/backend/migrations/001_initial_schema.ts` — schema foundation.
5. `packages/frontend/src/App.tsx` + `router/` — app shell and routing.
6. `packages/frontend/src/lib/api/client.ts` — API client pattern.
7. `docs/core/ARCHITECTURE.md` — mental model.

## 3. Verification Map

| Claim in docs | Verify in |
|---|---|
| 57 modules | `ls packages/backend/src/modules` |
| 82 pages | `ls packages/frontend/src/pages` |
| 29 migrations | `ls packages/backend/migrations` |
| 154 tests | `npm test` |
| 2,676 i18n keys | `packages/frontend/src/i18n/en.json` |
| Zero type errors | `npm run build` |

---

*Related: [Project context](PROJECT-CONTEXT.md) · [Execution rules](EXECUTION-RULES.md)*
