# Proposed Function 11: Production Release Hardening and End-to-End Acceptance

**Planning date:** 20 August 2026
**Status:** Proposal only — no implementation started

## Executive recommendation

The recommended Function 11 is **Production Release Hardening and End-to-End Operational Acceptance**. Functions 1–10 now remove the major misleading success states and establish the core clinical, financial, provider, automation, export, backup, and AI workflows. The most valuable next step is therefore not another isolated business feature; it is proving that the complete system can be deployed, monitored, tested, rolled back, and operated safely as one clinic product.

This recommendation follows the repository’s approved release plan, which already identifies the next minor release as **E2E expansion, an observability endpoint, and release automation** [1]. The current browser smoke coverage contains health, login, unauthenticated route protection, and basic rendering checks, but it does not yet exercise authenticated tenant workflows or cross-tenant/role boundaries [2]. The deployment guide also documents a migration command as applying migrations `001–029`, while the current repository contains migrations through `070`; this documentation and deployment-contract drift should be corrected as part of the release-hardening slice [3].

> **Function 11 should answer one operational question:** “Can a clinic administrator deploy this system, verify that it is healthy, exercise the critical workflows safely, detect failures, and return to the previous application build without corrupting tenant data?”

## Candidate comparison

| Candidate | Value | Risk if chosen now | Recommendation |
|---|---|---|---|
| Production release hardening and E2E acceptance | Converts the completed feature work into a verifiable release candidate; covers deployment, observability, tenant isolation, critical workflows, and rollback. | Requires disciplined test fixtures and staging infrastructure rather than only source changes. | **Recommended Function 11.** |
| Data-warehouse ETL completeness | Improves analytics freshness and reporting depth. | Does not prove that clinical, billing, backup, or provider workflows are deployable and supportable. | Defer to a separate analytics slice. |
| PWA/offline reference data | Helps intermittent-connectivity clinics. | Requires an explicit offline consistency/conflict model and can create stale clinical data risks. | Defer until the online release contract is stable. |
| Additional provider adapters | Adds country/vendor coverage. | Provider contracts, credentials, sandbox accounts, and callback agreements are external dependencies; generic adapters could reintroduce hardcoded regional behavior. | Implement only for a named tenant/provider contract. |
| Multi-region data residency | Supports larger deployments and regulatory expansion. | Major architectural, legal, operational, and migration scope; not a normal minor release. | Defer to a separately governed major release. |

## Proposed scope

### 1. Health, readiness, and observability contract

The backend should retain the existing `/health` compatibility endpoint and add a clear liveness/readiness distinction. Liveness should indicate that the process is responsive. Readiness should check the configured database and required runtime dependencies, including Redis and MinIO/object storage when the active deployment requires them, and should report worker lifecycle state for backup, export, report, ETA, and automation workers. Dependency failures must produce a non-ready response without exposing credentials, connection strings, SQL text, or tenant data.

Every request should carry or receive a correlation/request identifier that is returned in the response header and included in structured Pino logs and audit correlation metadata. Operational metrics should cover request count, latency, error class, dependency failures, queue depth, worker state, provider failures, and durable job states. Metrics may be exposed through a protected operational endpoint or a deployment-compatible exporter, but the endpoint must not expose patient data, prompts, secrets, tokens, or raw provider payloads.

### 2. Authenticated Playwright end-to-end acceptance suite

The current smoke tests should become a repeatable staging/disposable-stack suite using seeded non-production fixtures. The suite should log in as explicitly created test users and verify the real frontend-to-backend path, not merely inspect page markup. It should include both successful and denied paths.

The critical journey should cover tenant setup and provider configuration, role-aware navigation, patient creation and search, appointment creation, pharmacy prescription/dispense safety, invoice and internal payment recording, manual InstaPay request and reconciliation, report/export creation and secure download, backup queue and status, automation queue/worker status, provider verification, and AI chat with a mocked or test gateway. External SMS, voice, payment, tax, and model calls must remain mocked or isolated in this suite unless a specific user-approved sandbox credential is supplied.

The suite must include cross-tenant and scope-negative cases: a user cannot read or mutate another tenant’s patient, invoice, artifact, provider evidence, AI request, or automation execution; branch and department restrictions remain effective; read-only roles cannot mutate; and frontend hiding is not treated as the security boundary.

### 3. CI and release automation

The CI pipeline should run reproducibly from a clean checkout using `npm ci`, build shared/backend/frontend packages, run all backend and frontend unit tests, run the dedicated PostgreSQL integration targets against disposable databases, run the Playwright smoke suite against a disposable or staging stack, and build the production Docker images. Migration validation should apply the full current migration chain through `070`, detect pending migrations, and fail before deployment if the schema or application build is inconsistent.

A main-branch deploy should occur only after these gates pass. The deployment job should perform a post-deploy smoke check against `/health`, readiness, API versioning, and one authenticated non-destructive endpoint. The workflow should publish the commit SHA and application version in safe health metadata so an operator can confirm which build is running. Production deployment must remain controlled by the repository’s configured secrets and platform approvals; Function 11 should not silently introduce an unattended destructive deploy mechanism.

### 4. Migration, rollback, and operational runbooks

The deployment documentation should be reconciled with the real migration chain through `070`, including the source-only nature of Function 10. The release process should include a pre-migration encrypted backup, migration inventory, staging migration rehearsal, startup verification, and a rollback statement that distinguishes application rollback from irreversible schema rollback. Forward-safe migrations remain the policy; the system must not pretend that deleting a migration or rolling back application code reverses already-applied data changes.

The release package should include tested runbooks for deployment, health/readiness failure, provider outage, backup/restore drill, failed migration, worker recovery, tenant isolation incident, and application rollback. Each runbook should identify the required permission, operator, evidence to collect, and safe stopping point.

### 5. Security and production-configuration gate

The release gate should verify that production startup rejects missing or weak required secrets, that cookies/CSRF/CORS/rate limits are configured for the deployment, that the production database role is not `BYPASSRLS`, that containers run as non-root where documented, and that no frontend bundle contains provider secrets. Critical dependency and image vulnerabilities should be reported and resolved or explicitly risk-accepted before release. This is a verification and release gate, not a broad unrelated security rewrite.

## Functional requirements and acceptance criteria

| ID | Requirement | Acceptance condition |
|---|---|---|
| F11-01 | Liveness/readiness | Liveness and readiness have documented status codes and JSON shapes; readiness becomes non-ready when a required dependency is unavailable; `/health` remains backward-compatible. No secrets or tenant data are returned. |
| F11-02 | Correlation and structured logs | A request ID is generated or propagated, returned safely, logged with the request outcome, and available for audit/support correlation. |
| F11-03 | Operational metrics | Request latency/errors, dependency state, worker state, provider failures, queue depth, and durable job states are observable without exposing PHI, prompts, credentials, or raw provider payloads. |
| F11-04 | Authenticated E2E | Playwright exercises real login, tenant setup, patient/appointment, pharmacy, billing/manual reconciliation, report/export, backup, automation, provider verification, and AI chat paths using isolated fixtures. |
| F11-05 | Negative E2E authorization | Cross-tenant, cross-branch, department, read-only, and unsupported-provider cases return safe denial/not-found/unsupported outcomes at the backend. |
| F11-06 | Full CI gate | Clean-checkout CI passes build, unit suites, PostgreSQL integration targets, migration validation, browser smoke tests, and Docker image builds before main deployment. |
| F11-07 | Migration safety | A disposable database applies migrations `001–070` successfully from clean state; an upgrade rehearsal from a representative prior state succeeds; migration inventory and required environment are documented. |
| F11-08 | Deployment smoke | After deployment, automated checks verify commit/version identity, liveness, readiness, API versioning, and one authenticated non-destructive request. |
| F11-09 | Rollback evidence | The previous application build can be redeployed after forward-safe migrations, and the runbook clearly states what is and is not reversible. A restore drill is not performed against production data. |
| F11-10 | Configuration/security gate | Production environment validation, non-BYPASSRLS role, CSRF/CORS/cookie/rate-limit settings, non-root container behavior, secret redaction, and critical vulnerability review are verified. |
| F11-11 | Documentation synchronization | Deployment, environment, release checklist, smoke-test, incident, and rollback documents match the current route, migration, version, and worker behavior. |

## Explicit exclusions

Function 11 should not add a new clinical specialty, new country/provider adapter, cross-currency conversion, PWA offline synchronization, multi-region residency, clinical diagnosis or treatment recommendations, automatic live vendor transactions, or a new billing rail. It should not weaken RBAC, bypass tenant predicates, expose a public metrics endpoint containing sensitive data, or treat a browser redirect, local reference, model placeholder, or health response as proof that an underlying provider or business operation completed.

It should also not claim that a clinic is production-ready solely because repository CI passes. The clinic administrator must still supply real deployment secrets, provider sandbox credentials where applicable, operational contacts, retention policies, and a staging acceptance sign-off.

## Proposed implementation order

The implementation should proceed in six validated slices. First, freeze the contract and correct deployment/version/migration documentation. Second, implement liveness/readiness, correlation, and safe operational metrics. Third, create isolated E2E fixtures and authenticated tenant/role journeys. Fourth, connect the CI and deployment gates, including migration rehearsal and Docker smoke checks. Fifth, execute security/configuration checks and runbooks. Sixth, perform full validation, document evidence, commit implementation and documentation separately, and push only after all gates pass.

## Approval requested

I recommend approving Function 11 with the title **Production Release Hardening and End-to-End Operational Acceptance**, using the scope and exclusions above. If approved, implementation should begin with an audit of the current health route, CI workflows, Playwright configuration, migration runner, container healthchecks, and version metadata. No code should be changed until this scope is accepted or revised.

## References

[1]: `docs/project-management/RELEASE-PLAN.md` "Approved release plan: v2.1.0 E2E expansion, observability endpoint, and release automation"
[2]: `e2e/tests/api-health.spec.ts`, `e2e/tests/auth.spec.ts`, and `e2e/tests/patients.spec.ts` "Current Playwright smoke coverage"
[3]: `docs/engineering/DEPLOYMENT.md` "Approved deployment guide and current migration command documentation"
