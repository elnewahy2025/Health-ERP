# Configuration — Health-ERP Clinic Management System

**Version:** 2.0 | **Status:** Synchronized with Function 11 release hardening
**Source of truth:** `.env.docker.example`, `packages/shared/src/config/environment.ts`, tenant Settings/provider-configuration contracts

## 1. Configuration model

Infrastructure configuration flows through the shared environment loader and backend validation. `NODE_ENV` selects development, test, or production validation. `.env` and `.env.docker` are local/deployment inputs; committed templates document names and safe placeholders only. Secrets may be supplied through the supported Docker `_FILE` convention or the hosting platform secret manager.

Clinic identity and operational values are not infrastructure environment variables. Tenant administrators enter clinic identity, timezone, currency, branches, departments, enabled modules, provider environments, and provider configuration through the supported Settings boundaries. Provider secrets are encrypted at rest and must not be returned to the frontend or placed in a bundle.

## 2. Core runtime variables

| Variable | Production requirement | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Selects production validation. |
| `PORT`, `HOST` | Platform values; backend normally `3000`/`0.0.0.0` | API listener. |
| `APP_URL`, `APP_VERSION`, `APP_COMMIT_SHA` | Public HTTPS URL and immutable release identity | URLs and operational identity. |
| `CORS_ORIGIN` | Explicit HTTPS origin(s), never `*` | Browser origin policy. |
| `COOKIE_SECURE` | `true` | Secure refresh/session cookie behavior. |
| `REDIS_REQUIRED`, `OBJECT_STORAGE_REQUIRED`, `WORKERS_REQUIRED` | `true` in production | Readiness dependency policy. |

## 3. Database variables and role policy

| Variable | Use |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Target PostgreSQL service/database. |
| `DB_USER`, `DB_PASSWORD` | Runtime application role; must be `NOSUPERUSER` and `NOBYPASSRLS`. |
| `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD` | Migration operator role used by the TypeScript migration runner. |
| `DB_SSL` | `true` when required by the managed database. |

The runtime and migration roles may be the same only in controlled local/test environments. Production Compose requires both sets explicitly. The security/configuration gate checks the live runtime role and fails if it is a superuser or has `BYPASSRLS`.

## 4. Authentication and encryption

| Variable | Requirement |
|---|---|
| `JWT_SECRET` | Strong, non-default signing secret. |
| `JWT_REFRESH_SECRET` | Strong, non-default secret distinct from `JWT_SECRET`. |
| `CSRF_SECRET` | Strong secret for state-changing browser requests. |
| `ENCRYPTION_KEY` | Strong production field-encryption key; rotation requires a controlled decrypt/re-encrypt plan. |
| `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY_DAYS` | Reviewed session lifetimes. |
| `BCRYPT_ROUNDS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`, `MAX_CONCURRENT_SESSIONS` | Reviewed authentication-hardening values. |

Do not print, commit, paste into tickets, or include in CI artifacts any of these values. Secret rotation must be coordinated with active sessions, encrypted fields, provider integrations, backup decryption, and rollback compatibility.

## 5. Redis, object storage, email, and optional providers

Redis host/port/password configure distributed rate limiting, queues, and runtime dependency checks. MinIO/S3-compatible values configure object storage; the required/optional decision is controlled by the deployment environment and must be reflected in readiness flags. SMTP and messaging provider variables are optional infrastructure integrations and do not establish tenant clinic configuration.

Stripe, Fawry, ETA, Twilio, WhatsApp, and AI/provider values are tenant/provider settings or protected platform secrets according to their contract. The application must remain truthful when a provider is unavailable or not configured. No URL, wallet, tax identifier, payment reference, phone number, model, or provider endpoint should be treated as a universal clinic default.

## 6. Backup and observability

| Variable | Purpose |
|---|---|
| `BACKUP_S3_BUCKET`, `BACKUP_RETENTION`, `BACKUP_ENCRYPTION_KEY` | Protected backup artifact location, retention, and encryption. |
| `SENTRY_DSN` | Optional error-monitoring destination. |
| `LOG_LEVEL` | Structured log verbosity; avoid debug payloads in production. |

Backups require checksum and restore evidence. A configured bucket alone does not prove recoverability. Provider, database, and worker errors should be represented by safe codes and correlation IDs rather than secrets or raw upstream payloads.

## 7. Frontend and Vercel

For the same-origin Vercel proxy, leave `VITE_API_URL` unset unless the reviewed hosting architecture requires another value. Vercel needs the configured backend rewrite target and deployment secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`) for guarded deployment jobs. Frontend bundles must contain no backend secret, provider secret, database password, JWT, cookie, or encrypted secret value.

## 8. Validation commands

Use the following commands against controlled targets:

```bash
npm run lint
npm run build
npm run migration:check
npm run security:config-gate
npm run test:docker-smoke
npm run test:post-deploy-smoke
```

For a CI-only production-configuration check without a live database connection, use the explicit `--static-production` mode with disposable values. The live production gate must still verify the actual runtime database role before release.

## References

- [Environment guide](ENVIRONMENT.md)
- [Deployment guide](DEPLOYMENT.md)
- [Operations runbooks](OPERATIONS-RUNBOOKS.md)
- [Docker environment template](../../.env.docker.example)
- [Shared environment loader](../../packages/shared/src/config/environment.ts)
- [Function 11 Workstream D evidence](../function11-workstream-d-security-configuration-2026-08-20.md)
