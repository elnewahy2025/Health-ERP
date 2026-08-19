# Function 11 Implementation Plan and Test Specification

**Function:** Production Release Hardening and End-to-End Operational Acceptance
**Planning date:** 20 August 2026
**Status:** Approved planning package; implementation not started

## 1. Current baseline and design principles

Functions 1–10 are complete and pushed. Function 11 is therefore a release-engineering slice, not a new clinical or payment feature. The current backend has a registered health module at `packages/backend/src/modules/health/index.ts`, API-version middleware at `packages/backend/src/core/versioning/middleware.ts`, application assembly in `packages/backend/src/index.ts`, a Playwright configuration at `playwright.config.ts`, a PostgreSQL migration runner at `packages/backend/scripts/run-postgres-integration.ts`, and CI workflows in `.github/workflows/ci.yml` and `.github/workflows/vercel.yml`.

The root `test` script currently runs the backend unit suite, while the root E2E command runs Playwright. The existing browser coverage is limited to health, login, unauthenticated route protection, and basic rendering. The release plan requires broader E2E coverage, an observability endpoint, and release automation [1]. The deployment guide documents migration execution, health checks, monitoring, rollback, and Docker/Vercel/Railway targets, but its migration example must be reconciled with the current chain through migration `070` [2].

The implementation must preserve the following principles:

| Principle | Required behavior |
|---|---|
| Tenant safety | Health, metrics, release, and E2E infrastructure must never expose another tenant’s data, provider credentials, AI prompts, or raw clinical payloads. |
| Backend authority | E2E tests may verify frontend gates, but every permission and scope assertion must be enforced by backend responses. |
| No production demo data | Test fixtures belong only to disposable/staging databases and are created with unique identifiers; no seed fixture may ship as production data. |
| Forward-safe operations | Function 11 must not add destructive migrations; application rollback must be distinguished from schema rollback. |
| No external side effects by default | Provider, SMS, voice, tax, payment, and model calls remain mocked or use explicitly supplied sandbox credentials only. |
| Observable failure | Readiness, workers, provider calls, and durable jobs must report truthful state rather than a successful placeholder. |

## 2. Target architecture and workstreams

### Workstream A — Health and readiness contract

Extend the existing health module rather than creating a parallel health system. Preserve `GET /health` as the compatibility liveness response and add explicit readiness semantics, preferably `GET /health/live` and `GET /health/ready`; the final route names must be confirmed against the existing API-version middleware before implementation. Add a shared typed health service that evaluates process liveness, database connectivity, Redis availability when required, MinIO/object-storage availability when configured as required, and durable worker lifecycle state.

The response must contain a stable status, build/version identifier, response timestamp, and non-sensitive component statuses. It must not contain connection strings, SQL, Redis URLs, bucket names when sensitive, secrets, tokens, tenant identifiers, patient data, or raw provider responses. Readiness must return a non-success status when a required dependency is unavailable, while liveness must remain available if the process itself is responsive. Optional dependencies must be labelled optional/configured rather than causing false readiness failures.

### Workstream B — Correlation and operational observability

Use Fastify’s request identifier as the canonical correlation ID, accepting a safe inbound request ID only under the project’s trust policy. Return it in a response header, include it in structured Pino request logs, and pass it into audit correlation metadata where audit records are created. Do not log request bodies, prompts, API keys, cookies, authorization headers, or raw provider payloads.

Extend the existing system-monitor/operational monitoring boundary for safe metrics. The metrics contract should cover request totals and latency classes, error classes, database/Redis/object-storage dependency failures, provider verification/payment/AI upstream failures, and durable queue/worker states. If a metrics endpoint is exposed, it must require the existing administrative monitoring permission or deployment-level protection and must return aggregates only. Multi-replica deployments must treat process-local counters as diagnostic, not as a complete global accounting system; structured logs and the configured monitoring platform remain authoritative for aggregate operations.

### Workstream C — Disposable E2E fixture and authenticated journey framework

Add a test-only E2E setup/teardown path that creates a unique tenant, branches, departments, users, roles, and minimum clinical fixtures in a disposable database. Credentials must come from E2E environment variables or generated test values, never from source-controlled production defaults. The setup must fail when pointed at a non-test database and must clean up only its own fixture namespace.

Extend the current Playwright suite with API-assisted authentication/storage-state setup for named test personas: tenant administrator, clinician, pharmacist, pharmacy technician, billing officer, reporting user, read-only user, and a second tenant user. Browser assertions must verify navigation and user-visible states, while API assertions verify the exact status code, tenant boundary, permission, and audit/result state.

### Workstream D — CI and deployment gates

Replace the current narrow CI test step with explicit gates for shared/backend/frontend builds, backend and frontend unit suites, PostgreSQL integration targets, migration readiness, Playwright E2E, and Docker image builds. The existing PostgreSQL service is sufficient for most integration targets; MinIO or a controlled test storage substitute must be added for artifact/backup E2E cases that require object storage. Redis must remain part of the integration environment because rate limiting, workers, and runtime health depend on it.

The migration gate must apply the full current TypeScript migration chain through `070` to a disposable database, report pending migrations, and run a representative upgrade rehearsal from a prior migration snapshot. The release workflow must not deploy after a failed build, test, migration, or smoke gate. Production deploy behavior must remain platform-controlled through configured secrets and approvals. The current Vercel workflow should be guarded so missing deployment secrets produce a clear skipped/unconfigured state rather than an ambiguous failure.

Post-deploy smoke checks must verify the deployed commit/version, liveness, readiness, API-version behavior, and one authenticated non-destructive endpoint. A failed smoke check must stop promotion and retain logs/artifacts for diagnosis.

### Workstream E — Release documentation and runbooks

Synchronize `docs/engineering/DEPLOYMENT.md`, `docs/project-management/RELEASE-PLAN.md`, environment documentation, release checklist, and the Function 11 status section. Correct stale migration examples and document the actual current migration chain, E2E commands, health/readiness contract, CI prerequisites, worker dependencies, and rollback limits.

Add concise runbooks for deployment, failed readiness, failed migration, provider outage, worker recovery, backup/restore drill, tenant-isolation incident, and application rollback. Each runbook must name the operator, required permission or deployment access, evidence to collect, safe stopping point, and whether the action changes production data.

### Workstream F — Security and production-configuration gate

Add automated checks for required production secrets and minimum strength, non-BYPASSRLS database role configuration, CSRF/CORS/cookie/rate-limit settings, non-root container behavior, frontend bundle secret absence, and critical dependency/image vulnerability review. This workstream verifies existing controls and closes release gaps; it does not redesign the RBAC model or introduce a second tenant-isolation mechanism.

## 3. Implementation order and file targets

| Phase | Main changes | Expected evidence |
|---:|---|---|
| 1 | Freeze health/readiness/version/correlation contracts; audit exact existing route behavior and API-version middleware. | Contract tests and redacted response examples. |
| 2 | Implement health/readiness service, safe monitoring metrics, request-ID propagation, and worker/dependency status adapters. | Backend unit tests, route tests, redaction tests, dependency-failure tests. |
| 3 | Implement disposable E2E fixture setup, storage-state personas, critical journey specs, and negative tenant/role specs under `e2e/`. | Playwright report, fixture cleanup evidence, repeatable isolated run. |
| 4 | Expand `.github/workflows/ci.yml`, migration readiness checks, PostgreSQL/Redis/MinIO test services, Docker build/health smoke, and guarded deployment promotion. | CI run URL/artifacts, migration output, image build logs, post-deploy smoke output. |
| 5 | Update deployment/release/runbook documentation and add security/configuration checks. | Documentation diff, configuration audit report, vulnerability review record. |
| 6 | Run complete validation, stage acceptance, review rollback evidence, commit implementation and documentation separately, and push only after all gates pass. | Final test matrix, commit hashes, remote head, clean working tree. |

Likely implementation files include `packages/backend/src/modules/health/index.ts`, a new health/observability service under `packages/backend/src/services/`, `packages/backend/src/core/versioning/middleware.ts` only if version metadata needs to be extended, `packages/backend/src/index.ts` for lifecycle/worker readiness wiring, `playwright.config.ts`, new files under `e2e/`, `packages/backend/scripts/run-postgres-integration.ts` for migration/E2E support where appropriate, `.github/workflows/ci.yml`, `.github/workflows/vercel.yml`, Docker/Compose healthcheck files, and the deployment/release documents. Exact file changes must be confirmed during implementation; no new migration is assumed at the planning stage.

## 4. Executable test specification

### 4.1 Health, readiness, version, and correlation tests

| ID | Test | Setup | Expected result |
|---|---|---|---|
| H-01 | Compatibility liveness | Start backend with valid test environment. | `GET /health` remains successful with stable status and no sensitive fields. |
| H-02 | Explicit liveness | Start backend and call the new liveness route. | Successful response identifies process liveness and includes safe version metadata. |
| H-03 | Database readiness | Start with database available, then exercise a controlled database failure or stub. | Ready when available; non-ready status when required database check fails; no stack trace or connection secret. |
| H-04 | Redis readiness | Configure Redis as required and test ping success/failure. | Readiness accurately changes; optional Redis is labelled optional only when configuration says so. |
| H-05 | Object-storage readiness | Configure MinIO/object storage as required and test success/failure. | Readiness accurately changes without exposing bucket credentials or raw SDK errors. |
| H-06 | Worker readiness | Start/stop or mark each durable worker state in the test harness. | Health reports safe worker state and does not claim all workers ready when a required worker is stopped. |
| H-07 | API-version compatibility | Call supported and unsupported version routes with headers. | Existing supported behavior remains green; unsupported versions retain the documented error contract. |
| H-08 | Version identity | Set a test application version/commit value. | Health and post-deploy smoke expose the expected safe version/commit identity. |
| H-09 | Correlation generation | Call without a request ID. | Response includes a generated request ID and logs carry the same ID. |
| H-10 | Correlation propagation | Call with a permitted request ID. | Safe request ID is echoed and logged; invalid/oversized values are replaced or rejected according to policy. |
| H-11 | Redaction | Send a request containing authorization, cookie, provider-secret-shaped, and prompt-shaped values. | Logs, health, metrics, and error responses contain none of those values. |

### 4.2 Backend operational and security integration tests

| ID | Test | Setup | Expected result |
|---|---|---|---|
| B-01 | Fresh migration chain | Apply migrations `001–070` to a disposable PostgreSQL database. | All migrations apply successfully and the expected migration state is recorded. |
| B-02 | Migration idempotency | Run the migration command twice. | Second run is a no-op; no duplicate schema objects or data corruption occurs. |
| B-03 | Upgrade rehearsal | Restore a representative pre-Function-11 schema snapshot, then apply current migrations. | Upgrade succeeds and existing tenant/configuration/workflow rows remain readable. |
| B-04 | Tenant isolation matrix | Create two tenants and exercise patient, invoice, artifact, provider-evidence, AI-request, and automation references. | Foreign-tenant access returns the documented safe denial/not-found result for every tested endpoint. |
| B-05 | Branch and department scope | Create users with branch/department-restricted grants and cross-scope rows. | Backend filters and denies cross-scope access even when IDs are guessed. |
| B-06 | Read-only mutation denial | Use a view-only persona on representative create/edit/approve/execute routes. | Backend returns denial; no row, artifact, payment, job, or audit mutation occurs. |
| B-07 | Worker lifecycle | Start application, verify workers, stop gracefully, restart, and simulate stale work. | Workers start/stop deterministically, stale leases recover according to each module contract, and readiness does not lie. |
| B-08 | Metrics authorization | Access metrics as unauthorized, authorized non-admin, and authorized monitor/admin personas. | Unauthorized access is denied; authorized output is aggregate-only and redacted. |
| B-09 | Production environment validation | Run startup with missing/weak required secrets, unsafe CORS/cookie/CSRF settings, or BYPASSRLS role metadata. | Production validation fails closed with actionable but nonsecret errors. |
| B-10 | Error contract | Force dependency timeout, provider failure, malformed upstream response, and worker error. | API returns stable safe error code/status, records correlation, and never reports successful underlying operation. |
| B-11 | Rate limiting and CSRF | Exercise representative public/authenticated mutating routes under configured limits and missing CSRF. | Requests are throttled or rejected according to the existing policy, without bypass through alternate API versions. |
| B-12 | Bundle secret scan | Build frontend and scan emitted assets for known secret values and forbidden secret variable names. | No provider key, JWT secret, database password, or encrypted secret value appears in the bundle. |

### 4.3 Playwright E2E specifications

The E2E suite must use isolated fixtures and environment-provided credentials. It must not point at a production database. The same critical specs should run at least twice against a fresh disposable stack to detect state leakage and fixture-order dependence.

| ID | Spec | Main journey and assertions |
|---|---|---|
| E-01 | `api-health.spec.ts` | Verify compatibility health, liveness/readiness, API-version success/error, safe version identity, request ID, and response latency. |
| E-02 | `auth.spec.ts` | Verify valid login for a fixture admin, invalid credentials, empty submission, logout/session expiry, and no protected-page access after logout. |
| E-03 | `tenant-setup.spec.ts` | Admin edits clinic identity, currency, timezone, branch, department, and provider configuration; reload confirms persistence and no secret value is returned. |
| E-04 | `role-navigation.spec.ts` | Each fixture persona sees only permitted navigation/actions; backend denial is asserted for any attempted hidden mutation. |
| E-05 | `patient-appointment.spec.ts` | Create/search a patient, create an appointment, confirm branch/department scope, and verify audit evidence. |
| E-06 | `pharmacy-safety.spec.ts` | Create safe prescription, trigger allergy/interaction or stock warning, require authorized override where configured, dispense by lot, and verify idempotent repeat. No negative stock is allowed. |
| E-07 | `billing-manual-payment.spec.ts` | Record internal payment separately, create manual InstaPay request, reconcile or reject with statement data, and verify invoice state and history. No external payment is sent. |
| E-08 | `artifacts.spec.ts` | Queue report/export/backup work, observe pending/processing/completed/failed states, download only as authorized, and verify cross-tenant download denial. |
| E-09 | `automation.spec.ts` | Queue an allowlisted automation, observe worker result and per-step evidence, verify idempotent retry, and deny unauthorized mutation/execution. External delivery remains mocked. |
| E-10 | `provider-verification.spec.ts` | Run provider verification in mock/sandbox mode for Stripe/Twilio/Fawry/ETA and confirm no SMS, call, payment reference, tax submission, or secret exposure. Manual InstaPay remains not-supported. |
| E-11 | `ai-chat.spec.ts` | Configure a test gateway/provider, send chat, display real response, replay idempotently, show explicit unavailable/failure states, and confirm tenant/role boundaries. Test gateway is local/mock only. |
| E-12 | `tenant-isolation.spec.ts` | Log in as tenant B and attempt tenant A patient, invoice, artifact, provider evidence, AI request, and automation references through UI/API. Every attempt is safely denied or not found. |
| E-13 | `release-smoke.spec.ts` | Verify deployed build identity, liveness/readiness, login, one non-destructive authenticated endpoint, asset loading, and no console/runtime crash. |

### 4.4 CI, Docker, migration, and deployment tests

| ID | Test | Expected result |
|---|---|---|
| D-01 | Clean checkout install | `npm ci` succeeds with lockfile integrity and no undeclared dependency requirement. |
| D-02 | Full build gate | Shared, backend, and frontend builds pass from clean checkout. |
| D-03 | Unit gate | Backend and frontend full suites pass; skipped tests are enumerated and intentional. |
| D-04 | PostgreSQL/Redis/MinIO gate | Dedicated integration targets pass against disposable services with no production credentials. |
| D-05 | Playwright gate | E2E suite passes against a disposable or staging stack and uploads report, traces, screenshots, and fixture logs. |
| D-06 | Docker build gate | Backend/frontend/backup images build, run as documented, and pass healthchecks. |
| D-07 | Migration preflight | Current schema is at migration `070`; pending or divergent migration state blocks promotion. |
| D-08 | Post-deploy smoke | Deployed commit/version, liveness, readiness, API version, and authenticated non-destructive endpoint pass before promotion. |
| D-09 | Rollback smoke | Previous application image/build starts against the forward-migrated database and passes health plus read-only smoke; any incompatible schema behavior is documented as a stop condition. |
| D-10 | Deployment secret guard | Missing Vercel/Railway/deployment secrets cause a clear skipped or failed gate, never an ambiguous partial production deploy. |

### 4.5 Security and release checklist tests

| ID | Test | Expected result |
|---|---|---|
| S-01 | Secret redaction | No secrets appear in logs, health, metrics, API responses, Playwright traces, or CI artifacts. |
| S-02 | Tenant/RLS role | Production database role is verified as non-BYPASSRLS; RLS integration remains green. |
| S-03 | Container identity | Production container processes run as non-root where documented; filesystem write locations are explicit. |
| S-04 | Dependency/image review | Critical vulnerabilities are fixed or have a written, approved risk decision before release. |
| S-05 | Security headers | Health and frontend deployment preserve documented HSTS, frame, MIME, referrer, and permissions policies. |
| S-06 | Incident evidence | A simulated provider outage, readiness failure, worker failure, and tenant-isolation alert produce a correlation ID and an actionable runbook path. |

## 5. Commands and artifacts

The final Function 11 command set should include the existing root build/lint/unit commands, all registered PostgreSQL targets, and new E2E/release commands. Proposed commands are:

| Command | Purpose |
|---|---|
| `npm run build` | Production shared/backend/frontend build. |
| `npm run lint` | Shared/backend/frontend TypeScript validation. |
| `npm test` | Backend unit suite, with an explicit frontend unit command added to the CI gate. |
| `npm run test -w packages/frontend` | Frontend unit suite. |
| `npm run test:integration -w packages/backend` and other registered targets | PostgreSQL integration coverage; each target applies migrations through the canonical runner. |
| `npm run test:e2e` | Playwright health/authenticated critical-journey suite against `E2E_BASE_URL` and `E2E_API_URL`. |
| `npm run test:e2e:release` | Noninteractive release-smoke subset with fixture setup and artifact capture. |
| `npm run migration:check` | Fresh/upgrade/pending migration validation through migration `070`. |
| `npm run test:docker-smoke` | Compose/image startup, healthcheck, readiness, and non-destructive API smoke. |

Required CI artifacts are the test summaries, Playwright HTML report, traces/screenshots on failure, migration output, health/readiness JSON samples, Docker health logs, vulnerability review, release commit/version identity, and rollback smoke result. Artifacts must be scrubbed of secrets, cookies, authorization headers, patient data, prompts, and provider payloads.

## 6. Delivery and acceptance gates

Implementation proceeds in the order Workstream A through F, but each workstream is a reversible slice with its own tests and commit. No deployment workflow change should be merged before its local validation is green. The implementation commit and documentation commit must remain separate, as in Functions 1–10.

Function 11 is accepted only when all of the following are true:

1. Health/readiness/version/correlation contracts are implemented, documented, and tested.
2. Full backend/frontend unit suites, focused tests, all registered PostgreSQL integration suites, and Playwright critical journeys pass against isolated infrastructure.
3. Fresh and upgrade migration rehearsals through `070` pass without destructive changes.
4. Docker images build and healthchecks/readiness behave correctly under dependency failure.
5. CI blocks deployment on failed build/test/migration/smoke gates and produces scrubbed evidence artifacts.
6. Security/configuration checks pass, including non-BYPASSRLS, secret redaction, CSRF/CORS/cookie/rate-limit, container identity, and vulnerability review.
7. Deployment, rollback, backup/restore, provider-outage, worker-recovery, and tenant-isolation runbooks are synchronized with the implementation.
8. A staging or disposable-stack operational acceptance run is signed off by the clinic administrator or designated release owner.
9. Implementation and documentation are committed separately, `git diff --check` passes, the full build passes, `origin/main` matches the pushed head, and the working tree is clean.

## 7. Rollback and safety rules

Function 11 should prefer additive source/configuration changes and avoid schema changes unless migration evidence proves a durable release need. Health/metrics code can be disabled or reverted independently. E2E and CI changes can be rolled back without changing tenant data. If a schema change becomes necessary, it must be forward-safe, rehearsed from a clean and representative prior state, and explicitly documented before implementation.

An application rollback may redeploy the previous image/build after a forward migration only when the rollback smoke test proves compatibility. If compatibility is not proven, the release must stop rather than delete migrations or manually edit production data. Provider outage, dependency failure, or readiness failure must result in a truthful not-ready/error state, not a successful-looking operation.

## 8. References

[1]: `docs/project-management/RELEASE-PLAN.md` "Approved release plan: v2.1.0 E2E expansion, observability endpoint, and release automation"
[2]: `docs/engineering/DEPLOYMENT.md` "Approved deployment targets, migration, health, monitoring, rollback, and disaster-recovery guidance"
[3]: `packages/backend/src/modules/health/index.ts` "Current health module"
[4]: `packages/backend/src/core/versioning/middleware.ts` "Current API-version middleware"
[5]: `packages/backend/scripts/run-postgres-integration.ts` "Canonical PostgreSQL migration/integration runner"
[6]: `playwright.config.ts` and `e2e/tests/` "Current Playwright configuration and smoke tests"
[7]: `.github/workflows/ci.yml` and `.github/workflows/vercel.yml` "Current CI and frontend deployment workflows"
