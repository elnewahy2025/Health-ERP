# Release Plan — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Release Cadence

| Track | Cadence | Example |
|---|---|---|
| Patch | on-demand (hotfix) | security fixes, critical bugs |
| Minor | every 2–4 weeks | features, non-breaking improvements |
| Major | 1–2× per year | breaking API/schema changes, new major versions |

Versioning per [VERSIONING.md](VERSIONING.md) (SemVer, currently 1.0.0/2.0.0 branding).

## 2. Release Process

1. **Freeze:** code complete on `main`; CI green (build + tests).
2. **Changelog:** update `CHANGELOG` from conventional commits (feat/fix/perf…).
3. **Version bump:** package.json + shared `APP_VERSION`; tag `vX.Y.Z`.
4. **Build & stage:** run full `npm run build`; deploy to staging; run e2e smoke suite.
5. **Migration check:** list migrations to apply; verify backward compatibility.
6. **Deploy:** follow [DEPLOYMENT.md](../engineering/DEPLOYMENT.md) (Railway/Docker/Vercel).
7. **Post-deploy:** health checks, `GET /health`, monitor logs/Sentry; update CHECKPOINT.md + ROADMAP.md.

## 3. Release Checklist

- [ ] `npm run build` passes (shared → backend → frontend)
- [ ] `npm test` passes (154 tests)
- [ ] e2e smoke passes against staging
- [ ] Migrations applied and reversible in dev
- [ ] Changelog + version bumped; tag pushed
- [ ] Env vars documented in CONFIGURATION.md if new
- [ ] Docs synchronized (module docs, CHECKPOINT, DECISIONS)
- [ ] Backup taken before production DB migration

## 4. Hotfix Path

- Branch from `main` → fix → PR with tests → merge → patch release (skip minor/major steps).
- Security hotfixes follow INCIDENT_RESPONSE.md timeline.

## 5. Scheduled Release Calendar (next)

| Target | Type | Contents |
|---|---|---|
| v2.1.0 | minor | E2E expansion, observability endpoint, release automation |
| v2.2.0 | minor | DW ETL completeness, PWA offline reference data |
| v3.0.0 | major | Multi-region data residency enforcement, FHIR export (planned) |

---

*Related: [Roadmap](../core/ROADMAP.md) · [Versioning](VERSIONING.md) · [Deployment](../engineering/DEPLOYMENT.md)*
