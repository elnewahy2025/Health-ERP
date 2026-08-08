# Styleguide — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Enforced by:** ESLint + Prettier + `tsc`

---

## 1. Tooling

| Tool | Config | Rules |
|---|---|---|
| TypeScript | `tsconfig.base.json` + per-package | strict, ES2022, moduleResolution bundler |
| ESLint | `.eslintrc.json` | `no-explicit-any: error`, `curly: all`, `eqeqeq: always`, react hooks |
| Prettier | `.prettierrc` | single quotes, trailing commas, 2-space indent |

## 2. TypeScript Conventions

- Strict mode everywhere; no `any` (ESLint error).
- Domain types live in `@healthcare/shared/types`; modules import them — never redefine.
- Enums/const objects in shared `config/constants.ts` (`PERMISSIONS`, `PASSWORD`, `JWT`, `DATE_FORMATS`, etc.).
- Use `satisfies`/`as const` for typed constants; prefer unions over string literals.
- Exports: named exports; `index.ts` barrel per module.

## 3. Backend Module Structure

Clean Architecture modules follow this file naming and flow:

```text
auth.types.ts       → domain types (re-exported via shared when shared-worthy)
auth.schema.ts      → Zod schemas (request validation)
auth.repository.ts  → data access (Knex)
auth.service.ts     → business logic
auth.controller.ts  → request/response mapping
auth.routes.ts      → Fastify route registration + guards
index.ts            → registerAuthModule(app)
```

- Service-first: controllers stay thin; validation at boundary.
- Errors: throw `AppError` subclasses from `@healthcare/shared/errors`
  (`NotFoundError`, `ValidationError`, `ForbiddenError`, `ConflictError`, `UnauthorizedError`).
- Audit every write: `logAudit(...)`.
- Rate limit auth endpoints using presets from `utils/rate-limiter.ts`.

## 4. Frontend Conventions

- React function components + hooks; TypeScript strict.
- Pages in `pages/`, shared UI in `components/ui`, feature components in `components/features`.
- Data fetching via `lib/api/*` typed clients + React Query hooks in `lib/query`.
- Forms: `react-hook-form` + `zodResolver`; error display on every field.
- Async actions: `try/catch` + `toast.error()`.
- Sanitize user input with `sanitizeString()` before rendering/interpolation.
- Lazy-load routes; no giant page bundles (code splitting in `router/`).

## 5. Naming

| Item | Convention | Example |
|---|---|---|
| Files | `kebab-case`; backend modules `name.role.ts` | `auth.service.ts`, `patients-page.tsx` |
| Functions | camelCase, verb-first | `registerAuthModule`, `getPatientById` |
| Components | PascalCase | `PatientDetailPage`, `DataTable` |
| Types | PascalCase | `Patient`, `AuthTokens` |
| Constants | UPPER_SNAKE | `MAX_LOGIN_ATTEMPTS` |
| DB tables | snake_case plural | `appointments`, `refresh_tokens` |
| Env vars | UPPER_SNAKE | `DB_HOST` |

## 6. i18n & Content

- Every UI string through `useTranslation()` / `t()`; keys in `en.json` + `ar.json` (2,676 keys).
- No hardcoded English/Arabic in components; keys namespaced by page/domain.
- Currency: EGP formatting via shared `formatCurrency`.

## 7. Security Coding Rules

- Never log secrets, tokens, passwords, NID (pino redaction configured; still avoid).
- Never use `Math.random()` for security — `crypto.randomInt/randomBytes` only.
- Parameterized queries only; no string-concatenated SQL.
- New tenant-scoped table → add RLS policy + tenant_id column (migrations 023/027 pattern).

## 8. Git & Commit Style

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `perf:`.
- PRs must pass CI (build + tests); one logical change per PR.
- Never commit `.tsbuildinfo`, `.env*`, `dist/`.

---

*Related: [Contributing](CONTRIBUTING.md) · [Design system](../product/DESIGN-SYSTEM.md)*
