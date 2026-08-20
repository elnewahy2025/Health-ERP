# Deployment — Health-ERP Clinic Management System

**Version:** 2.0 | **Status:** Engineering runbook synchronized with Function 11 Workstreams A–E
**Governance boundary:** The repository release state remains **Development only** until the release decision log, named owners, clinical acceptance, recovery evidence, and applicable privacy/security approvals are complete.

## 1. Supported deployment targets

| Target | Mechanism | Operational use |
|---|---|---|
| Local development | `docker-compose.yml` for infrastructure plus `npm run dev` | Disposable development and integration work only. |
| Self-hosted production | `docker-compose.prod.yml` with TLS reverse proxy | Full clinic stack, including PostgreSQL, Redis, object storage, API, frontend, Nginx, and backup service. |
| Railway backend | `railway.json` | Managed Fastify API and backend worker host. The start command runs the TypeScript migration runner before `node dist/index.js`. |
| Vercel frontend | `vercel.json` and the guarded CI workflow | Managed SPA hosting and `/api/*` proxy to the configured backend. |

The current reference topology is a Railway backend, a Vercel frontend, managed PostgreSQL/Redis/object storage, and tenant/provider configuration stored through the application’s supported Settings boundaries. Self-hosted Compose is a separate complete-stack target. Do not combine partial local infrastructure with production data.

## 2. Release authority and promotion gate

A deployment is promoted only from an immutable commit that passed the CI `release-gate`. The gate requires shared/backend/frontend build, unit suites, migration readiness, PostgreSQL integration, managed Playwright E2E, Docker smoke, security/configuration checks, and container vulnerability scans. Configured Vercel deployment jobs depend on that gate and the production post-deploy smoke.

A green CI run is evidence for its exact commit. The release owner must verify the artifact SHA, deployment environment, migration state, backup evidence, clinic settings acceptance, and rollback compatibility before approving production traffic. The repository’s governance decision log remains authoritative for whether a release may be labelled production-ready.

## 3. Build and test commands

From a clean checkout, use:

```bash
npm ci
npm run lint
npm run build
npm run test -w packages/backend
npm run test -w packages/frontend
npm run migration:check
npm run security:config-gate
npm run test:e2e:release
```

The migration and E2E commands require a controlled disposable or staging target. Do not aim them at production unless the release owner and database operator have explicitly approved the read-only/preflight action. Do not run `npm run seed` against production. The repository’s seed command is not part of the production release path.

For a disposable Docker validation, use `npm run test:docker-smoke`. For a deployed environment, use `npm run test:post-deploy-smoke` with protected `SMOKE_BASE_URL`, `SMOKE_EXPECTED_COMMIT_SHA`, `SMOKE_ACCESS_TOKEN`, and `SMOKE_TENANT_SLUG` values. The smoke script checks liveness, readiness, version identity, API-version behavior, security headers, request correlation, and one authenticated non-destructive principal response without logging tokens or clinic data.

## 4. Production configuration

Production must use secrets from the hosting platform or Docker secrets, never values copied from templates. Required controls include strong and distinct `JWT_SECRET` and `JWT_REFRESH_SECRET`, strong `CSRF_SECRET` and `ENCRYPTION_KEY`, `COOKIE_SECURE=true`, HTTPS `APP_URL` and `CORS_ORIGIN`, required Redis/object storage/worker flags, and an immutable `APP_COMMIT_SHA`/`APP_VERSION`.

The production runtime database role is configured through `DB_USER` and `DB_PASSWORD` and must be a dedicated `NOSUPERUSER`/`NOBYPASSRLS` role. Migrations use `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD`. The migration runner grants the runtime role the required schema/table/sequence privileges after a migration when the roles are different. The production security gate verifies the live runtime role; CI’s RLS and lifecycle integration targets exercise the non-BYPASSRLS behavior.

Clinic identity, timezone, currency, branches, departments, enabled modules, provider environments, and provider-specific configuration belong to the tenant Settings and provider-management boundaries. Deployment variables must not become a second source of clinic configuration.

## 5. Railway backend procedure

Before triggering a Railway deployment, confirm the service secrets and role split, the intended `APP_COMMIT_SHA`, the configured worker and dependency flags, and the backup evidence. Railway executes `npm install --include=dev --no-audit --no-fund`, builds shared/backend packages, then starts the backend through `npm run migrate && node dist/index.js`.

After the deployment reports healthy, verify the public contract and run the authenticated smoke:

```bash
curl --fail-with-body --silent --show-error -i https://<backend-host>/health
curl --fail-with-body --silent --show-error -i -H 'X-API-Version: v1' https://<backend-host>/api/v1/health/live
curl --fail-with-body --silent --show-error -i -H 'X-API-Version: v1' https://<backend-host>/api/v1/health/ready
npm run test:post-deploy-smoke
```

A readiness failure, version mismatch, security-header failure, or authenticated principal failure stops promotion. Do not accept a successful liveness response as proof that dependencies and durable workers are ready.

## 6. Self-hosted Compose procedure

Prepare a protected `.env` using `.env.docker.example` as a template. Production Compose requires explicit runtime and migration database credentials and fails interpolation when those values are absent. Validate the rendered configuration without storing it as an artifact:

```bash
docker compose -f docker-compose.prod.yml --env-file .env config >/tmp/health-erp-compose-config.txt
```

Review the rendered output for accidental defaults and secret exposure. Then build, start, and inspect the stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env build
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml --env-file .env ps
```

The backend depends on healthy PostgreSQL, Redis, and MinIO services and exposes readiness through `/api/v1/health/ready`. Restore external traffic only after backend readiness, Nginx health, TLS, frontend asset loading, API proxying, and post-deploy smoke have passed. `docker compose down -v` is destructive to local volumes and is not a production rollback command.

## 7. Vercel frontend procedure

Vercel preview and production jobs run only after the guarded CI release gate and configured deployment secrets. The rewrite target in `vercel.json` must point to the intended backend. Keep `VITE_API_URL` unset for the same-origin proxy unless a reviewed architecture requires another value. The frontend bundle must not contain backend secrets, provider secrets, JWTs, or database credentials.

A Vercel deployment is accepted only after asset loading, SPA fallback, security headers, API proxy behavior, and the corresponding authenticated post-deploy smoke pass. Vercel rollback restores a frontend build; it does not roll back database schema, backend state, provider actions, or tenant data.

## 8. Migration and rollback rules

The current chain ends at migration `071_branch_contract_compatibility.ts`. The migration gate applies the complete TypeScript chain, verifies idempotent re-run, and reports pending migrations. Production migrations are forward-only and must be rehearsed against a representative disposable or staging database.

A migration failure stops deployment. Do not delete `knex_migrations` rows, mark a migration complete manually, edit production schema ad hoc, or restore over the live database as an application rollback. Correct an environmental lock/configuration problem or prepare a reviewed forward-fix migration.

Application rollback is allowed only when the previous immutable application build is compatible with the forward-migrated database. The release owner must verify liveness, readiness, API-version behavior, security headers, commit identity, and authenticated read-only access after rollback. If compatibility is unproven, stop and use the separately approved disaster-recovery process rather than deleting schema changes.

## 9. Health, readiness, correlation, and monitoring

`GET /health` remains the compatibility liveness response. Versioned `/api/v1/health/live` and `/api/v1/health/ready` expose explicit liveness/readiness contracts. Readiness reports safe component state for the database, required Redis/object storage, and durable workers; it must return a non-success response when a required dependency is unavailable. Responses contain safe status/version/timestamp/correlation information and no credentials, tenant identifiers, clinical payloads, raw provider responses, or connection strings.

Every smoke or incident record should retain the `X-Request-ID`, commit identity, UTC timestamp, safe status/error code, and deployment environment. Do not copy authorization headers, cookies, request bodies, provider payloads, AI prompts, or patient data into tickets or CI artifacts.

## 10. Backup and disaster recovery

The production Compose backup service writes to the `backup_data` volume at `/backups`, runs `pg_dump`, records a SHA-256 checksum, optionally encrypts with the configured backup encryption key, optionally uploads to S3-compatible storage, and removes artifacts older than `BACKUP_RETENTION_DAYS`. These artifacts do not constitute restore evidence until a representative isolated restore succeeds.

Before migrations or high-risk changes, confirm the latest artifact, checksum, encryption/upload status, and retention. Run restore drills only into a new isolated database, verify the checksum and migration state, provision a non-BYPASSRLS runtime role, test representative read-only behavior and encrypted fields, and destroy temporary decrypted files after evidence capture. Record the drill result and owner in the release/recovery record. The current governance state remains Development only until the designated owners sign off the recovery evidence.

## 11. Troubleshooting and escalation

| Symptom | First safe action | Do not do |
|---|---|---|
| Readiness is 503 | Compare liveness/readiness, inspect redacted component status and dependency logs, stop promotion | Do not bypass readiness or claim workers are ready. |
| Migration failed | Stop replicas, preserve migration evidence, run check-only against a controlled target | Do not delete migration records or restore over production. |
| Worker failed | Preserve job/lease/request identifiers and restart through the platform procedure | Do not mark durable work completed manually or replay non-idempotent actions. |
| Provider outage | Pause affected tenant/provider operation and keep state pending/failed truthfully | Do not fabricate payment, tax, message, voice, AI, or verification success. |
| Suspected cross-tenant access | Stop the affected operation, preserve request/audit evidence, revoke sessions if needed | Do not probe live clinical data, broaden grants, or delete tenant rows. |
| Frontend/API mismatch | Check Vercel rewrite, backend commit identity, API-version headers, and post-deploy smoke | Do not ship a frontend that points to an unverified backend. |

Use `docs/engineering/OPERATIONS-RUNBOOKS.md` for the detailed step-by-step procedures and `docs/security/INCIDENT_RESPONSE.md` for the broader security incident process. Formal release decisions belong in `docs/governance/release-decision-log.md`.

## References

- [Operations runbooks](OPERATIONS-RUNBOOKS.md)
- [Environment guide](ENVIRONMENT.md)
- [Configuration reference](CONFIGURATION.md)
- [Release plan](../project-management/RELEASE-PLAN.md)
- [Incident response plan](../security/INCIDENT_RESPONSE.md)
- [Release decision log](../governance/release-decision-log.md)
- [Function 11 Workstream A evidence](../function11-workstream-a-health-readiness-2026-08-20.md)
- [Function 11 Workstream C evidence](../function11-workstream-c-ci-deployment-2026-08-20.md)
- [Function 11 Workstream D evidence](../function11-workstream-d-security-configuration-2026-08-20.md)
