# Project Context — Vision Healthcare ERP (for AI Agents)

**Purpose:** Give an AI agent (or new engineer) the minimal accurate context to work safely in this repo.

---

## 1. What This Project Is

Multi-tenant healthcare ERP SaaS for the Egyptian market: EMR + practice management
(patients, appointments, billing, inventory, HR, pharmacy, labs, insurance, AI assistance),
bilingual EN/AR with RTL, deployed via Docker/Railway/Vercel.

## 2. Repository Map (top-level)

| Path | Meaning |
|---|---|
| `packages/shared/` | Domain types, config, crypto, validators, formatters, errors, i18n, permission middleware |
| `packages/backend/` | Fastify API: `src/modules` (57), `src/services`, `src/plugins`, `src/core`, `migrations/` (29) |
| `packages/frontend/` | React SPA: `src/pages` (82), `src/components`, `src/lib/api`, `src/lib/query`, `src/i18n` |
| `e2e/` | Playwright specs |
| `docs/` | This documentation package (index: `docs/index.md`) |
| `deployment/` | Nginx configs, scripts |
| `docker-compose*.yml`, `Dockerfile.*` | Containerization |
| `.github/workflows/` | CI/CD |

## 3. Critical Conventions (non-negotiable)

1. **Build order:** shared → backend → frontend. `@healthcare/shared` must be built before
   dependents (`npm install` runs `prepare`; CI builds in order).
2. **Resolution:** `@healthcare/shared/types` etc. resolve through workspace symlink +
   package `exports` map — do NOT add source path aliases.
3. **Never commit:** `.tsbuildinfo`, `dist/`, `.env*`, secrets.
4. **Types:** strict TS, no `any`; shared types are the single source of truth.
5. **Validation:** Zod schemas at route boundaries.
6. **Security:** RBAC guards, tenant scoping (RLS), AES-256-GCM for sensitive fields,
   audit on writes, redacted logs, no `Math.random()` for security.
7. **i18n:** new UI strings must have EN + AR keys.

## 4. Current State

- All feature phases delivered; security audit clean (zero critical/high).
- Docs package being completed (this session); e2e expansion pending.
- Known gaps: metrics endpoint, report performance profiling (CHECKPOINT.md).

## 5. How to Verify Work

```bash
npm run build    # must pass for shared/backend/frontend (tsc strict)
npm test         # backend tests (154)
npx playwright test  # e2e with stack running
```

## 6. Where to Learn More

- Full index: `docs/index.md`
- Architecture: `docs/core/ARCHITECTURE.md`
- Decisions: `docs/core/DECISIONS.md`
- Module patterns: `docs/modules/README.md`

---

*Related: [Reading map](READING-MAP.md) · [Execution rules](EXECUTION-RULES.md)*
