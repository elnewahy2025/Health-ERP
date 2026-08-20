# Health-ERP Operational Runbooks

**Product:** Health-ERP configurable Clinic Management System  
**Document status:** Operational guidance implemented with Function 11 Workstream E  
**Release boundary:** Documentation completion does not change the governance state; the repository remains **Development only** until the release decision log, named owners, clinical acceptance, recovery evidence, and applicable privacy/security approvals are complete.

## 1. Purpose and operating boundary

This document is the operator-facing procedure set for the shipped Function 11 release-hardening controls. It describes safe stopping points and evidence collection for deployment, readiness, migrations, workers, providers, backups, rollback, and tenant-isolation incidents. It does not authorize production use, define jurisdiction-specific legal deadlines, or replace a clinic’s clinical governance, privacy, security, financial, or disaster-recovery approval.

> **Core rule:** When a gate fails, stop promotion or external side effects first. Do not convert an incomplete or failed gate into “pass with workaround” for clinical, privacy, security, data-integrity, or financial controls.

The application’s public configuration is tenant-scoped through the Settings and provider-configuration boundaries. Do not reintroduce clinic identity, currency, tax, payment, provider, messaging, or AI defaults into deployment scripts. Deployment environment variables are infrastructure controls and secrets; clinic operational values belong to tenant settings.

## 2. Roles and authority

Formal governance owners are currently unassigned in the repository. Before a real release, the release owner must name the people filling the roles below and record the decision in the release decision log. The same person may hold multiple roles only when the clinic’s governance process explicitly permits it.

| Role | Required authority | Main responsibility during an incident or release |
|---|---|---|
| Release owner | Release approval and deployment access | Decides whether a gate is complete, starts/stops promotion, and records the release SHA. |
| Clinic administrator | Tenant administration and operational acceptance | Confirms clinic settings, branches, departments, role access, and user-facing acceptance. |
| DevOps/SRE operator | Runtime, hosting, CI/CD, and secret-management access | Runs deployment, readiness, rollback, logs, and infrastructure recovery steps. |
| Database operator | Database and backup/restore access | Runs migration preflight, verifies roles, performs isolated restore drills, and protects production data. |
| Security/privacy owner | Security monitoring and incident authority | Leads secret exposure, tenant-isolation, authentication, and data-access incidents. |
| Clinical/operations owner | Clinical workflow acceptance | Confirms that a release does not change safe clinical operating procedures without review. |
| Provider/finance owner | Provider and reconciliation authority | Controls payment, tax, messaging, and provider environment changes; no external side effect is assumed by this runbook. |

## 3. Release preflight

The release owner must complete the preflight before requesting a production deployment. A successful CI run is evidence for the commit that ran; it is not evidence for an uncommitted local tree or a different deployment artifact.

| Check | Required evidence | Stop condition |
|---|---|---|
| Source identity | `git rev-parse HEAD`, remote head, release tag or immutable SHA | Local and remote SHA differ, or the deployment artifact cannot be tied to a commit. |
| CI release gate | Successful `release-gate` job with build, unit, integration, migration, E2E, Docker smoke, security, and container scan jobs | Any required job failed, was cancelled, or was skipped without an explicit configured reason. |
| Configuration | Production secrets, HTTPS URLs, secure cookies, Redis/object storage/workers flags, separate DB runtime/migration roles | Missing, weak, default, shared, or unverified values. Never paste secret values into tickets or logs. |
| Database safety | Fresh backup evidence, migration check, non-BYPASSRLS runtime role verification, migration operator access | Backup is missing, restore evidence is stale, migrations are pending/divergent, or runtime role is superuser/BYPASSRLS. |
| Tenant settings | Clinic identity, timezone, currency, branches, departments, enabled modules, and provider environments reviewed by the clinic administrator | A required value is still an assumption, a provider is not configured for the intended jurisdiction, or a production side effect has not been approved. |
| Rollback | Previous application build/image identified and compatibility boundary understood | Previous build cannot run against the forward-migrated schema or no safe rollback owner is available. |

Use `npm ci`, `npm run lint`, `npm run build`, the full unit commands, `npm run migration:check`, and `npm run security:config-gate` only with a dedicated non-production or controlled target as appropriate. Do not run `npm run seed` against production. The seed command is not part of the production release path.

## 4. Deployment runbook

### 4.1 Railway backend deployment

Railway uses the repository’s `railway.json` build and start commands. The backend start command runs the TypeScript migration runner before `node dist/index.js`. Production must provide `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` for the migration operator, while `DB_USER` and `DB_PASSWORD` identify the dedicated runtime role. The runtime role must be `NOSUPERUSER` and `NOBYPASSRLS`.

Before deployment, confirm that the Railway service has the immutable `APP_COMMIT_SHA`, the intended `APP_VERSION`, production `NODE_ENV`, strong JWT/refresh/CSRF/encryption secrets, HTTPS `APP_URL` and `CORS_ORIGIN`, `COOKIE_SECURE=true`, required Redis/object-storage/worker flags, and all provider/backup secrets in the platform secret manager. Never use the repository’s template values as production secrets.

After the platform reports the new deployment healthy, run the post-deploy smoke from a controlled operator environment. Set `SMOKE_BASE_URL`, `SMOKE_EXPECTED_COMMIT_SHA`, `SMOKE_ACCESS_TOKEN`, and `SMOKE_TENANT_SLUG` through a protected secret mechanism and execute:

```bash
npm run test:post-deploy-smoke
```

The smoke checks `/health`, versioned liveness/readiness, request correlation, security headers, expected commit identity, and one authenticated read-only principal endpoint. It must not print the bearer token, cookies, patient data, or provider payloads.

### 4.2 Self-hosted Docker Compose deployment

The production Compose file is not the local development stack. Prepare a protected `.env` containing the production values and the separate database roles. Validate interpolation before starting anything:

```bash
docker compose -f docker-compose.prod.yml --env-file .env config >/tmp/health-erp-compose-config.txt
```

Review the rendered configuration for accidental defaults, especially `postgres`, `DB_USER`, `DB_MIGRATION_USER`, `COOKIE_SECURE`, URLs, and provider secrets. Do not store the rendered file as an artifact if it contains secrets. Build and start the stack only after the preflight and backup are complete:

```bash
docker compose -f docker-compose.prod.yml --env-file .env build

docker compose -f docker-compose.prod.yml --env-file .env up -d

docker compose -f docker-compose.prod.yml --env-file .env ps
```

The backend readiness healthcheck must be successful before traffic is restored. Verify externally through the TLS endpoint, not only the container network:

```bash
curl --fail-with-body --silent --show-error -i https://<clinic-host>/health
curl --fail-with-body --silent --show-error -i -H 'X-API-Version: v1' https://<clinic-host>/api/v1/health/ready
```

Then run `npm run test:post-deploy-smoke` with protected operator values. If readiness fails, stop promotion and use the failed-readiness procedure below.

### 4.3 Vercel frontend deployment

Vercel preview and production jobs are guarded by the CI release gate and configured deployment secrets. The backend URL is the rewrite target in `vercel.json`; do not add a second API base URL in a frontend bundle. Keep `VITE_API_URL` unset for the same-origin proxy unless the deployment architecture explicitly requires a different value and it has been reviewed.

A frontend deployment is not accepted merely because Vercel returns a deployment URL. The release owner must confirm asset loading, SPA fallback, security headers, API proxy behavior, and the authenticated post-deploy smoke against the corresponding backend commit. Vercel rollback restores a previous frontend build only; it does not roll back database schema or backend data.

## 5. Failed readiness

Readiness is a truthful dependency and worker contract. Liveness may remain successful while readiness is failing. This is expected during a dependency outage and must not be bypassed by marking the deployment healthy manually.

1. Stop traffic promotion and record the deployment SHA, timestamp, affected environment, and the `X-Request-ID` from a failing response.
2. Compare liveness and readiness without exposing response bodies containing sensitive details:

   ```bash
   curl -i https://<clinic-host>/api/v1/health/live
   curl -i https://<clinic-host>/api/v1/health/ready
   ```

3. For Compose, inspect only the relevant service logs and status:

   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs --tail=200 backend postgres redis minio
   ```

4. Classify the safe component code: database, Redis, object storage, worker lifecycle, or configuration. Restore the dependency or correct the protected configuration; do not edit health responses or suppress the check.
5. Re-run readiness and the post-deploy smoke. If the check remains non-ready, keep the release stopped and escalate to the DevOps/SRE and release owners.

If the database is unavailable, do not restart repeatedly in a way that creates migration races. If Redis is required, do not accept the in-memory rate-limit fallback as production readiness. If a durable worker is not ready, do not claim queued clinical, report, export, backup, ETA, or automation work completed.

## 6. Failed migration

A migration failure is a release stop. Preserve the migration error, commit SHA, database identifier, migration table state, and correlation/request evidence without copying credentials or clinical rows into an incident channel.

1. Stop new backend replicas and prevent traffic from reaching a partially started version.
2. Check the target state from a protected operator environment:

   ```bash
   DB_HOST=<host> DB_PORT=<port> DB_NAME=<db> \
   DB_USER=<migration-user> DB_PASSWORD=<protected-value> \
   DB_MIGRATION_USER=<migration-user> DB_MIGRATION_PASSWORD=<protected-value> \
   NODE_ENV=production npm run migration:check
   ```

3. Do not delete rows from `knex_migrations`, mark a migration complete manually, edit production schema by hand, or run a development seed.
4. If the error is an environment or lock problem, correct that condition and rerun the same migration gate once the database operator confirms safety. If the migration itself is defective, prepare a reviewed forward-fix migration and rehearse it against a representative disposable copy.
5. Resume deployment only after the migration gate reports no pending migrations, the runtime role remains non-BYPASSRLS, and the post-deploy smoke passes.

Application rollback after a forward migration is allowed only when the previous build is proven compatible with the migrated schema. Schema rollback by deleting or reversing migrations is not an approved procedure.

## 7. Provider outage or provider-verification failure

Provider operations are tenant-configured and jurisdiction-specific. A provider outage must not be disguised as a successful payment, tax submission, message, voice call, AI completion, or verification result.

1. The provider/finance owner records the tenant, provider key, configured environment, operation type, safe error code, request ID, and idempotency/reference key. Do not copy provider secrets or raw upstream response bodies.
2. Confirm whether the problem is provider-wide, tenant configuration, network policy, credential expiry, sandbox/production mismatch, or an internal queue/worker issue.
3. Pause the affected provider or operation through the supported Settings/provider-configuration boundary where appropriate. Do not change unrelated clinic modules or global defaults to work around one tenant’s configuration.
4. Keep invoices, callback history, reconciliation records, provider-verification evidence, and durable job state in their truthful pending/failed/retryable state. Never fabricate a reference, redirect URL, callback, tax receipt, or successful delivery.
5. For payments and tax, reconcile only from authoritative provider evidence after the provider recovers. For SMS, WhatsApp, voice, and AI, use the configured mock/sandbox path during validation and explicitly report unavailable state when no supported provider is configured.
6. Re-enable the operation only after a sandbox or controlled verification succeeds, the idempotency behavior is understood, and the provider/finance owner approves the change.

## 8. Worker recovery

The application reports durable worker lifecycle state in readiness. Workers cover the durable report, export, backup, ETA, and automation boundaries and may have different queue/state contracts.

1. If readiness reports a worker failure, stop release promotion and identify the worker from the redacted readiness component status.
2. Inspect the application and dependency logs using the deployment platform’s protected log viewer. Use request IDs, job IDs, execution IDs, and tenant-safe references rather than copying payloads.
3. Restart the affected application worker according to the hosting platform’s supported restart method. Do not manually mark `processing`, `running`, or `failed` rows as completed.
4. Confirm stale-lease recovery and idempotent retry behavior through the module’s durable state. A completed idempotent step must not execute again, and a non-idempotent or unknown action must fail closed.
5. Verify readiness, then inspect one authorized non-destructive result. For a failed report/export/backup/ETA/automation job, preserve the failed state and retry only through the supported module action after the cause is understood.

If a worker repeatedly fails, keep the affected operation disabled or stopped, preserve the evidence, and escalate to the release owner and module owner. Do not increase retry limits or bypass authorization during an incident.

## 9. Backup and restore drill

The production Compose backup service writes artifacts to the `backup_data` volume at `/backups`, uses `pg_dump` with the configured database credentials, records a SHA-256 checksum, optionally encrypts with the configured backup encryption key, optionally uploads to the configured S3-compatible endpoint, and deletes artifacts older than `BACKUP_RETENTION_DAYS`. The backup container is not proof that a restore has succeeded; restore must be rehearsed separately.

### Backup verification

Before a migration or high-risk configuration change, confirm the latest artifact, checksum, encryption state, retention, and upload status through the protected operator interface. For Compose, the operator may inspect the backup service without printing secret-bearing environment values:

```bash
docker compose -f docker-compose.prod.yml ps backup

docker compose -f docker-compose.prod.yml logs --tail=100 backup
```

A missing checksum, failed encryption, failed upload, or stale artifact is a stop condition. Do not delete the last known-good backup while investigating.

### Isolated restore drill

Restore only into a new isolated database or disposable environment. Never use a production database as the first restore target and never use `--clean` against the live clinic database.

1. Obtain the artifact and checksum through protected storage; verify the checksum before decryption.
2. Decrypt to a temporary protected path only when the artifact is encrypted. Keep the key out of shell history and logs.
3. Create a new restore database owned by a migration operator and restore the custom-format dump with `pg_restore`.
4. Apply any forward migrations required by the rehearsal and provision a dedicated non-BYPASSRLS runtime role.
5. Verify migration state, tenant count without exporting tenant identifiers, clinic settings readability, representative read-only endpoints, RLS behavior, encrypted field decryption, and backup metadata. Do not copy patient rows into tickets or screenshots.
6. Record duration, restored migration, checksum, application build, validation results, and any limitation. Destroy the isolated restore database and temporary decrypted files after the evidence is retained.

A restore drill that has not been completed against a representative schema remains an open release risk. The current governance release state remains Development only until the designated database and clinic owners sign off the drill.

## 10. Tenant-isolation incident

Treat suspected cross-tenant access as a P1/P2 security and data-integrity incident depending on confirmed impact.

1. Stop the affected endpoint, module action, or deployment promotion. Do not continue probing with live tenant data.
2. Preserve the release SHA, endpoint, user role, branch/department scope, timestamp, request ID, audit correlation, and safe response status. Do not copy patient, invoice, provider, AI, or artifact payloads into the incident channel.
3. Revoke the affected session or credentials when compromise is possible. Preserve logs and database audit evidence before rotation where the security owner permits.
4. Verify the boundary in a disposable or controlled test database using two isolated tenants and synthetic records. Expected outcomes are the documented `403` or safe `404`; a response containing foreign-tenant data is a confirmed incident.
5. Disable the affected operation or deploy a reviewed forward fix. Do not repair by deleting tenant rows, changing RLS policies manually, granting broad permissions, or hiding the UI action while the backend remains exposed.
6. Review patients, invoices, artifacts, provider evidence, AI requests, automation references, branches, and department scopes relevant to the endpoint. Determine whether any external provider or notification side effect occurred.
7. Notify the applicable privacy, security, clinical, and legal owners through the jurisdiction-specific incident process. Notification timing must be determined by the approved jurisdiction and facts; this document does not hardcode a legal deadline.
8. Re-run the tenant-isolation and role-scope tests, then obtain security and clinic-operations sign-off before restoring the operation.

## 11. Application rollback

Rollback restores a previous application image/build only after the release owner and database operator confirm that it is compatible with the already-forward-migrated schema. The database is not rolled back by deleting migration records or restoring over production during an application rollback.

1. Record the failing SHA, current migration, readiness/smoke output, and decision owner.
2. Stop promotion and freeze unrelated changes.
3. Select the previous immutable Railway deployment, Docker image, or Vercel deployment.
4. Redeploy the previous application artifact with the current database and protected runtime configuration.
5. Run liveness, readiness, API-version, security-header, and authenticated read-only smoke checks.
6. If the previous artifact is incompatible with the forward schema, stop. Prepare a forward compatibility fix or restore only through the separately approved disaster-recovery process.
7. After stabilization, open a post-incident review and record whether the migration, application, provider, infrastructure, or configuration caused the failure.

## 12. Evidence and communications

Every release or incident record should contain the immutable commit/build identity, timestamps in UTC, environment, operator and approver, gate results, migration state, backup/checksum reference, request IDs, safe error codes, affected module/tenant scope, action taken, stop point, and follow-up owner. It must not contain passwords, tokens, cookies, raw authorization headers, patient data, provider secrets, AI prompts, or raw upstream responses.

Use `docs/security/INCIDENT_RESPONSE.md` for the broader security incident process and communication templates. Use `docs/governance/release-decision-log.md` for formal release-state decisions. A chat message, local test run, or unreviewed code change is not a production approval.

## 13. Quick release checklist

| Gate | Command or evidence | Owner |
|---|---|---|
| Clean source and immutable identity | `git status`, remote SHA, CI commit | Release owner |
| Build and lint | `npm run lint && npm run build` | DevOps/SRE |
| Unit and integration | `npm run test -w packages/backend`, `npm run test -w packages/frontend`, registered PostgreSQL targets | Engineering/DBA |
| Migration | `npm run migration:check` against the controlled target | Database operator |
| Security/configuration | `npm run security:config-gate` or CI static-production gate | Security/DevOps |
| E2E and smoke | `npm run test:e2e:release`, `npm run test:post-deploy-smoke` | Release owner |
| Backup and recovery | Backup artifact/checksum plus isolated restore evidence | Database operator |
| Tenant and clinic acceptance | Settings, roles, branch/department scope, critical workflows | Clinic administrator/clinical owner |
| Production decision | Approved release decision entry and named approvers | Release owner/governance |

## References

- [Deployment guide](DEPLOYMENT.md)
- [Environment guide](ENVIRONMENT.md)
- [Configuration reference](CONFIGURATION.md)
- [Release plan](../project-management/RELEASE-PLAN.md)
- [Incident response plan](../security/INCIDENT_RESPONSE.md)
- [Release decision log](../governance/release-decision-log.md)
- [Function 11 Workstream A evidence](../function11-workstream-a-health-readiness-2026-08-20.md)
- [Function 11 cumulative status](../modular-settings-implementation-status-2026-08-19.md#function-11-workstreams-a-d-completed-workstream-e-pending)
- [Function 11 Workstream C evidence](../function11-workstream-c-ci-deployment-2026-08-20.md)
- [Function 11 Workstream D evidence](../function11-workstream-d-security-configuration-2026-08-20.md)
