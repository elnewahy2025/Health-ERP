# Release Plan — Health-ERP Clinic Management System

**Version:** 2.0 | **Status:** Engineering release procedure synchronized with Function 11 Workstreams A–E
**Governance state:** Development only; this document does not grant production approval.

## 1. Release tracks

| Track | Use |
|---|---|
| Patch | Security fixes, critical defects, or narrowly scoped operational corrections. |
| Minor | Reviewed backward-compatible product or configuration changes. |
| Major | Breaking API/schema changes, major hosting changes, or approved product scope changes. |

Release version and immutable build identity must be recorded in the release decision record. The Git commit SHA is authoritative for code identity; a human-readable version alone is insufficient.

## 2. Required release sequence

1. **Scope and ownership:** confirm the clinic, jurisdiction, operational scope, release owner, database operator, security/privacy owner, and clinical/operations owner.
2. **Code freeze:** merge only the intended changes to `main`; verify the local tree and remote head.
3. **Dependency and source install:** run `npm ci` from a clean checkout and do not introduce undeclared dependencies.
4. **Quality gates:** run shared/backend/frontend lint and build, backend and frontend unit suites, all registered PostgreSQL integration targets, and the migration gate.
5. **Security and release gates:** run the security/configuration gate, container image vulnerability scans, Docker smoke, managed Playwright E2E, and post-deploy smoke for the exact commit.
6. **Staging acceptance:** deploy to a disposable or staging environment, verify health/readiness/version/correlation/security headers, review clinic Settings, and execute the approved clinic workflow acceptance set.
7. **Recovery evidence:** take or verify a protected backup, confirm the checksum/encryption/upload state, and maintain current isolated restore evidence.
8. **Provider and financial controls:** verify sandbox/production mode, tenant provider configuration, callback/reconciliation behavior, and explicit approval for any external side effect. No provider, tax, payment, SMS, voice, or AI action is assumed successful from a UI state alone.
9. **Production decision:** record the release decision, known limitations, approvers, migration state, rollback boundary, and evidence links. A chat message or unreviewed code change is not approval.
10. **Production promotion:** deploy only through the guarded platform path or reviewed self-hosted procedure, then run post-deploy smoke before accepting traffic.
11. **Closure:** record the deployed SHA, smoke result, monitoring handoff, operator, time, and any follow-up owner.

## 3. Executable checklist

| Gate | Evidence or command | Required outcome |
|---|---|---|
| Clean checkout | `npm ci` | Lockfile install succeeds. |
| Lint and build | `npm run lint && npm run build` | Shared, backend, and frontend checks pass. |
| Unit suites | `npm run test -w packages/backend` and `npm run test -w packages/frontend` | Full suites pass; skips are reviewed and intentional. |
| PostgreSQL integration | Registered workspace integration commands | All targets pass on disposable services/roles. |
| Migration readiness | `npm run migration:gate` on disposable DB; `npm run migration:check` on controlled target | Current chain applies, re-runs idempotently, and has no pending state. |
| Security/configuration | `npm run security:config-gate` and CI static-production gate | Weak/default secrets, unsafe URLs/cookies, forbidden bundle values, invalid role state, or high/critical production audit findings fail closed. |
| Docker and images | `npm run test:docker-smoke`; CI image builds and Trivy scans | Images build, health/readiness work, final processes are non-root, and high/critical image findings block release. |
| Browser acceptance | `npm run test:e2e:release` against disposable/staging | Health/version/correlation, auth/session, tenant scope, cross-tenant denial, and unauthenticated protection pass. |
| Backup/recovery | Protected artifact/checksum plus isolated restore evidence | Restore is representative, readable, and reviewed. |
| Clinic acceptance | Settings, role navigation, branch/department scope, critical workflow checks | Clinic administrator and clinical/operations owner sign off. |
| Post-deploy | `npm run test:post-deploy-smoke` | Commit identity, liveness, readiness, API version, security headers, and authenticated read-only principal pass. |
| Governance | Release decision log entry and named approvers | Applicable phase gate is explicitly marked PASS; otherwise release remains BLOCKED. |

## 4. Migration and rollback policy

The current repository migration chain ends at `071_branch_contract_compatibility.ts`. Migrations are forward-safe and must be rehearsed against a representative disposable or staging database before promotion. Never delete migration records, reverse schema manually, or restore over production as a routine application rollback.

An application rollback may redeploy a previous immutable Railway/Docker/Vercel artifact only after the database operator confirms compatibility with the already-forward-migrated schema. The rollback smoke must pass liveness, readiness, version/API behavior, security headers, and authenticated read-only access. If compatibility is unproven, stop and prepare a forward fix or use the separately approved disaster-recovery process.

A Vercel rollback affects the frontend artifact only. A Railway/Docker rollback affects application code and workers only. Neither operation reverses tenant data, provider side effects, financial reconciliation, migrations, or backups.

## 5. Deployment and post-deploy

Use [DEPLOYMENT.md](../engineering/DEPLOYMENT.md) for Railway, self-hosted Compose, Vercel, migration, readiness, backup, and rollback procedures. Production Compose requires separate runtime/migration database credentials, and the runtime role must be `NOSUPERUSER` and `NOBYPASSRLS`.

After deployment, run the protected post-deploy smoke with `SMOKE_BASE_URL`, `SMOKE_EXPECTED_COMMIT_SHA`, `SMOKE_ACCESS_TOKEN`, and `SMOKE_TENANT_SLUG`. Do not put those values in committed files, screenshots, CI logs, or tickets. A failed smoke stops promotion.

## 6. Hotfix path

Branch from the current release line, reproduce the defect using synthetic or tenant-safe data, add a focused regression test, run the same required security and migration checks, and use the smallest forward-safe change. Security or tenant-isolation hotfixes follow the incident response process and require security/privacy review before restoring the affected operation.

## 7. Known limitations and release boundary

The CI and deployment gates are implemented and pushed, but Docker/Trivy execution still requires a runner with a Docker daemon. Provider, tax, payment, messaging, voice, and AI acceptance requires explicit sandbox or production credentials and owner approval; the repository does not claim those external account operations from unit/E2E fixtures. The restore runbook exists, but production release approval still requires a designated operator to complete and sign an isolated representative restore drill.

The current governance decision log remains authoritative: Health-ERP is **Development only** and must not be labelled production-ready or used as a hospital system of record until the missing clinical, privacy, security, recovery, pilot, and ownership evidence is approved.

## References

- [Deployment guide](../engineering/DEPLOYMENT.md)
- [Operations runbooks](../engineering/OPERATIONS-RUNBOOKS.md)
- [Environment guide](../engineering/ENVIRONMENT.md)
- [Configuration reference](../engineering/CONFIGURATION.md)
- [Incident response plan](../security/INCIDENT_RESPONSE.md)
- [Release decision log](../governance/release-decision-log.md)
- [Function 11 Workstream C evidence](../function11-workstream-c-ci-deployment-2026-08-20.md)
- [Function 11 Workstream D evidence](../function11-workstream-d-security-configuration-2026-08-20.md)
