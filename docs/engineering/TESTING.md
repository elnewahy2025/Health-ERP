# Testing — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Test Strategy

| Layer | Tool | Location | Scope |
|---|---|---|---|
| Unit (backend) | Vitest | `packages/backend/src/**/__tests__/*.test.ts` | Services, validators, formatters, guards |
| Unit (frontend) | Vitest + Testing Library | `packages/frontend/src/__tests__/` | Hooks, pages |
| Integration (backend) | Vitest + real Postgres/Redis (CI services) | `modules/__tests__/` | Routes + DB flows |
| E2E | Playwright | `e2e/tests/` | Auth, patients, API health smoke |
| Type-check | `tsc` (all packages) | — | Full monorepo build |

## 2. Current Coverage (verified)

| Metric | Value |
|---|---|
| Backend test files | 20 |
| Backend tests | 154 (all passing) |
| Frontend test files | 5 |
| E2E specs | 3 (`api-health`, `auth`, `patients`) |
| Type errors | 0 (`npm run build`) |

Backend test files:
`auth`, `patients`, `appointment`, `billing`, `inventory`, `compliance`, `hr`, `laboratory`,
`pharmacy`, `reports`, `notifications`, `ai`, `allergies`, `icd10`, `medications`, `timeline`,
`services/audit`, `services/totp`, `utils/validators`, `utils/formatters`.

## 3. Running Tests

```bash
# Backend tests
npm test                       # root → packages/backend vitest run
cd packages/backend && npx vitest run src/modules/__tests__/auth.test.ts

# Frontend tests
cd packages/frontend && npx vitest run

# E2E (requires running stack)
npx playwright test            # headless
npx playwright test --ui       # UI mode

# Type-check everything (integration gate)
npm run build
```

## 4. Test Environments

| Env | DB | Redis | Purpose |
|---|---|---|---|
| Local | Docker postgres (vision_erp) | Docker redis | dev/test |
| CI | service container `postgres:15-alpine` (healthcare) | redis:7-alpine | gate on push/PR |
| E2E | seeded local stack | local | full-stack smoke |

CI env overrides: `DB_*`, `REDIS_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=test` (see `.github/workflows/ci.yml`).

## 5. Coverage Strategy & Targets

- Backend: branch coverage ≥ 80% on services and validators; 100% on critical security paths (auth lockout, refresh rotation, RBAC).
- Frontend: hook tests for auth/patients/appointments; page smoke tests with `renderWithProviders`.
- E2E: one happy-path spec per P0 domain (auth, patients, appointments, billing, inventory).
- CI gate: build (tsc) + `npm test` must pass; coverage report generated via `@vitest/coverage-v8`.

## 6. Security & Regression Testing

- Auth regression suite: lockout, refresh rotation/reuse detection, MFA, OTP caps.
- RLS tests: cross-tenant access denied (patient module tests).
- XSS sanitization unit tests (`sanitize.ts` path) and validator tests.
- Dependabot updates must pass the full suite before merge.

## 7. Performance & Load Testing (planned)

- Profiling of report/BI endpoints (K-2 in CHECKPOINT.md).
- `k6` or Artillery load script for auth + patient search; target p95 < 300 ms.
- DB index review after load test.

## 8. Acceptance & DoD

- Feature merged only when its tests pass locally and in CI.
- New module → add module test file; new route → at least one 2xx + one 4xx test.
- Test strategy updates documented here; results in CHECKPOINT.md.

---

*Related: [Implementation plan](../core/IMPLEMENTATION-PLAN.md) · [Bug triage](../project-management/BUG-TRIAGE.md)*
