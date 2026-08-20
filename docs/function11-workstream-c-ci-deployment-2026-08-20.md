# Function 11 Workstream C: CI and Deployment Gate Evidence

**Date:** 20 August 2026  
**Status:** Implementation committed as `ec97121`; documentation commit pending

## Scope delivered

Workstream C replaces the previous narrow CI workflow with explicit release gates. The workflow now separates workspace quality, fresh and idempotent migration validation, all registered PostgreSQL integration targets, managed Playwright release E2E, Docker build/readiness smoke, and a final promotion gate. The promotion gate succeeds only when every required upstream gate succeeds. The deployment jobs are platform-controlled and remain behind the successful release gate.

The implementation adds `packages/backend/scripts/migration-gate.ts`. Its apply mode reports the completed and pending migration state, applies the complete TypeScript migration chain, runs the migration command a second time, and fails if the second run applies anything. Its check-only mode fails when a database has pending migrations. The current repository chain through migration `071_branch_contract_compatibility.ts` was applied to a fresh disposable database and rechecked idempotently; the gate reported **72 completed migrations and no pending migrations**.

The PostgreSQL integration workflow runs the repository’s thirteen registered integration targets. Ordinary application-predicate targets run with the disposable PostgreSQL test account. The FORCE RLS and authenticated lifecycle targets run with a dedicated `NOSUPERUSER NOBYPASSRLS` application role. The canonical integration runner grants that role access to the migrated schema only when `DB_APP_ROLE` is explicitly supplied; production behavior is unchanged. Backup integration receives a separately migrated restore database and never uses the application database as its restore target.

The Playwright configuration now supports an explicit CI-managed server mode. CI starts the backend and frontend as separate disposable processes, runs the authenticated health and critical-journey suite, runs the unauthenticated authentication/patient smoke suite, and uploads only Playwright reports, traces, screenshots, and test results. Secret-bearing fixture metadata is not uploaded. The fixture guard continues to refuse databases whose name does not contain `test`, `e2e`, or `staging`.

The Docker smoke gate generates disposable CI-only credentials, validates Compose configuration, starts PostgreSQL/Redis/MinIO, applies the migration gate, builds and starts the backend/frontend images, checks backend liveness/readiness, checks the served SPA, verifies request correlation and security headers, prints service state, and removes its volumes and project on exit. The local Compose frontend healthcheck was changed from an unconditional success to an actual HTTP probe. A separate post-deploy smoke script verifies health, liveness, readiness, API-version behavior, request correlation, security headers, expected commit identity, and one authenticated non-destructive principal endpoint.

Vercel preview and production jobs are now downstream of the release gate. Missing Vercel deployment secrets produce an explicit skipped notice rather than an ambiguous partial deployment. Production uses the `production` environment and requires `SMOKE_BASE_URL`, `SMOKE_ACCESS_TOKEN`, and `SMOKE_TENANT_SLUG` before deployment can be considered configured; the authenticated post-deploy smoke runs after the deployment. The previous standalone Vercel workflow was removed to prevent duplicate ungated deployments.

## Validation evidence

| Validation | Result |
|---|---|
| Workspace lint and type checks | Passed for shared, backend, and frontend. |
| Full backend unit suite | **46 test files passed; 301 tests passed; 13 files and 46 tests skipped.** |
| Full frontend unit suite | **13 test files passed; 49 tests passed.** |
| Fresh migration gate | **72 migrations applied; no pending migrations.** |
| Idempotent migration re-run and check-only mode | Passed; second apply was a no-op and check-only reported no pending migrations. |
| PostgreSQL integration matrix | **13 targets passed; 46 tests passed** across authorization, billing, RLS, lifecycle, pharmacy, backup, export, reports, ETA, InstaPay, automation, provider verification, and AI chat. |
| Managed authenticated release E2E | **10 tests passed**: six API-health assertions and four authenticated critical journeys. |
| Managed unauthenticated smoke E2E | **7 tests passed** for authentication and patient navigation. |
| Local post-deploy smoke | Passed against a disposable backend, including commit identity and authenticated principal access. |
| Workflow YAML, shell syntax, package JSON, and whitespace | Passed. |
| Production build | Passed for shared, backend, and frontend. |
| Docker runtime smoke | The gate is implemented and statically validated, but it was not executed in this sandbox because no Docker daemon is available. CI remains the authoritative Docker execution environment. |

The managed E2E run emitted only expected optional-Redis warnings because `REDIS_REQUIRED=false` was used for the disposable test environment. No provider, SMS, voice, tax, payment, or model call was performed. No production database or production credential was used.

## Safety and rollback boundary

The Workstream C changes are additive release infrastructure. The migration gate does not alter migration semantics; it only applies and verifies the existing chain. The optional `DB_APP_ROLE` grant path is activated only when explicitly configured by an integration environment. Docker smoke uses a unique Compose project and removes its temporary volumes. Application rollback remains distinct from schema rollback: migration `071` is forward-safe, and a previous application build may be redeployed only after the existing database compatibility has been proven by a separate rollback smoke.

Workstream C does not implement security vulnerability review, production-secret strength auditing, metrics, or operational runbooks. Those remain Workstreams D and E and must not be treated as complete from this slice.
