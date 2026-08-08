# Contributing — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Welcome

Contributions are welcome: features, fixes, tests, docs. Read the docs index first
(`docs/index.md`) so you understand the system before changing code.

## 2. Development Setup

```powershell
# Windows
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git
cd vision-healthcare-erp
Copy-Item .env.example .env
Copy-Item .env.docker.example .env.docker
docker compose up -d postgres redis minio
npm install          # builds shared via prepare
npm run build
npm run migrate
npm run dev
```

## 3. Branching & Workflow

1. Fork (external) or create branch `feature/xyz` / `fix/xyz` (internal).
2. Implement with tests; run `npm run build` + `npm test` locally.
3. Update module docs in `docs/modules/` and `CHECKPOINT.md` if behavior/scope changed.
4. Open PR against `main`; CI must pass (build + tests).
5. Review: at least one maintainer; security-sensitive code reviewed by two.

## 4. Definition of Done (summary)

- Build passes for shared, backend, frontend (tsc strict, zero errors)
- Tests added/passing; no type errors
- i18n keys added in EN + AR for new UI strings
- Audit logging + rate limiting on new authed/write endpoints
- Module doc updated; DECISIONS.md updated for architectural choices
- No secrets committed; no `.tsbuildinfo`/`dist` committed

## 5. Code Review Checklist

- [ ] No `any`; strict types
- [ ] Zod validation on inputs; parameterized SQL
- [ ] RBAC guard + tenant scoping (RLS) present
- [ ] Sensitive fields encrypted (AES-256-GCM) where applicable
- [ ] Audit event logged for writes
- [ ] Redaction-safe logging (no tokens/PII)
- [ ] Tests cover happy path + error path
- [ ] Docs updated

## 6. Testing Commands

```bash
npm run build                  # type-check everything
npm test                       # backend vitest
cd packages/frontend && npx vitest run
npx playwright test            # e2e (stack running)
```

## 7. Documentation Maintenance

- New module → `docs/modules/<module>.md` per template (see `docs/modules/README.md`).
- New env var → update `CONFIGURATION.md` + `.env.example`.
- New endpoint → update `API-SPECIFICATION.md`.
- New decision → append `DECISIONS.md` (ADR format).
- Update `CHECKPOINT.md` and `ROADMAP.md` at milestone end.

## 8. Getting Help

Open a GitHub issue with the issue template (`docs/project-management/ISSUE-TEMPLATE.md`);
for bugs include reproduction steps, logs (redacted), and affected version.

---

*Related: [Styleguide](STYLEGUIDE.md) · [Issue template](../project-management/ISSUE-TEMPLATE.md) · [Bug triage](../project-management/BUG-TRIAGE.md)*
