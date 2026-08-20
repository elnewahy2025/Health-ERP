# Environment — Health-ERP Clinic Management System

**Version:** 2.0 | **Status:** Synchronized with Function 11 release hardening
**Governance state:** Development only; environment documentation does not constitute production approval.

## 1. Environment matrix

| Environment | Backend | Frontend | Database | Redis | Object storage | Purpose |
|---|---|---|---|---|---|---|
| Local development | `:3000` via `npm run dev` | `:5173` Vite | Disposable PostgreSQL | Optional local Redis | Optional MinIO | Feature development and browser checks. |
| CI | Managed Playwright/server processes or workflow services | Ephemeral | Disposable PostgreSQL | CI service/optional test substitute | Controlled test substitute | Reproducible release gates only. |
| Staging | Railway or self-hosted controlled backend | Vercel preview or controlled static host | Managed/disposable PostgreSQL | Required managed Redis | S3-compatible or controlled MinIO | Pre-production acceptance and provider sandbox checks. |
| Production | Railway or `docker-compose.prod.yml` | Vercel or production Nginx | Managed PostgreSQL | Required managed Redis | Required MinIO/S3-compatible storage | Only after governance and operational acceptance approval. |

## 2. Reference topologies

### Railway/Vercel

```text
Vercel SPA ── /api/* rewrite ──► Railway Fastify API ──► PostgreSQL
                                      │                  ├─► Redis
                                      │                  ├─► object storage
                                      │                  └─► durable workers
```

Vercel rewrites the same-origin API path to the configured backend. WebSocket channels are not assumed to work through Vercel rewrites; supported polling fallbacks or a WS-capable backend host are required for those features.

### Self-hosted Compose

```text
TLS Nginx ─► frontend / API proxy ─► backend ─► PostgreSQL
                                      ├─► Redis
                                      ├─► MinIO
                                      └─► durable workers
backup service ──────────────────────► protected backup_data volume/S3
```

## 3. Local development

The local Compose stack is disposable infrastructure. Use `.env.docker.example` to generate a local environment and keep clinic/provider values in the tenant Settings flow. The ordinary local `DB_USER=postgres` example is not a production configuration. Removing local volumes with `docker compose down -v` destroys local data and must never be used against production.

```bash
docker compose up -d postgres redis minio
npm run migration:gate
npm run dev
curl --fail-with-body --silent --show-error http://localhost:3000/health
```

For an authenticated browser fixture, use only a database name containing the test/e2e/staging guard value and set the required disposable secrets. Never point Playwright global setup at a production database.

## 4. CI and release environment

CI uses `npm ci`, Node 20, disposable PostgreSQL and Redis services, controlled E2E values, and test-only credentials. The authenticated E2E fixture creates unique tenant data through public APIs and must not call production providers. CI artifacts must be scrubbed of tokens, cookies, authorization headers, patient data, prompts, and provider payloads.

The CI release gate includes build, lint, unit, migration, PostgreSQL integration, managed E2E, Docker smoke, security/configuration, and container vulnerability jobs. A configured preview or production deploy job is downstream of the release gate and must run post-deploy smoke before promotion is accepted.

## 5. Production variables and roles

Production must obtain secrets from the hosting platform or Docker secrets, not from committed templates. The following controls are mandatory:

| Control | Production requirement |
|---|---|
| `NODE_ENV` | `production`. |
| `APP_URL`, `CORS_ORIGIN` | HTTPS URLs; no wildcard CORS. |
| `COOKIE_SECURE` | `true`. |
| `REDIS_REQUIRED`, `OBJECT_STORAGE_REQUIRED`, `WORKERS_REQUIRED` | Required dependencies enabled. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY` | Strong, non-default values; JWT secrets distinct. |
| Runtime database | `DB_USER`/`DB_PASSWORD` identify a dedicated `NOSUPERUSER`/`NOBYPASSRLS` role. |
| Migration database | `DB_MIGRATION_USER`/`DB_MIGRATION_PASSWORD` identify the migration operator role. |
| Release identity | `APP_VERSION` and immutable `APP_COMMIT_SHA` are set. |

The runtime role is used by application queries and RLS-sensitive operations. The migration role applies schema changes and grants the runtime role required privileges. The Workstream D gate verifies the live runtime role and fails closed when it is superuser or has `BYPASSRLS`.

## 6. Dependency services

| Service | Production behavior | Failure meaning |
|---|---|---|
| PostgreSQL | Required; primary tenant and application state store. | Readiness fails; do not serve a new release. |
| Redis | Required for distributed rate limiting, queues, and runtime dependencies. | Readiness fails when required; an in-memory fallback is not production acceptance. |
| Object storage | Required for configured artifact/backup workflows. | Readiness fails when required; do not claim artifact completion. |
| Durable workers | Required for report/export/backup/ETA/automation boundaries as configured. | Readiness must report non-ready/stopped state truthfully. |
| Provider services | Tenant/provider and jurisdiction-specific, not global defaults. | Keep operation pending/failed truthfully and pause only affected scope. |

## 7. Safe verification

Use the compatibility liveness endpoint and versioned liveness/readiness aliases:

```bash
curl -i https://<host>/health
curl -i -H 'X-API-Version: v1' https://<host>/api/v1/health/live
curl -i -H 'X-API-Version: v1' https://<host>/api/v1/health/ready
```

Health responses may contain safe status/version/timestamp/correlation information, but must not expose connection strings, credentials, tenant identifiers, patient data, provider payloads, or raw upstream errors. Preserve `X-Request-ID` for evidence and troubleshooting.

## References

- [Deployment guide](DEPLOYMENT.md)
- [Operations runbooks](OPERATIONS-RUNBOOKS.md)
- [Configuration reference](CONFIGURATION.md)
- [Docker environment template](../../.env.docker.example)
- [Function 11 Workstream A evidence](../function11-workstream-a-health-readiness-2026-08-20.md)
- [Function 11 Workstream D evidence](../function11-workstream-d-security-configuration-2026-08-20.md)
