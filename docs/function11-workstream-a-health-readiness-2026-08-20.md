# Function 11 Workstream A: Health and Readiness Evidence

**Date:** 20 August 2026
**Status:** Implemented locally; pending separate implementation and documentation commits

## Scope delivered

Workstream A adds a safe, backward-compatible health/readiness contract without starting the later E2E, CI, observability-metrics, or deployment-promotion workstreams.

The existing root `GET /health` endpoint remains unauthenticated and successful when the process is responsive. It now returns the configured `APP_VERSION`, optional `APP_COMMIT_SHA`/`GIT_COMMIT_SHA` identity, and a request ID. The existing `/api/v1/health`, `/api/v1/ready`, and `/api/v1/live` routes remain available. Explicit aliases `/api/v1/health/ready` and `/api/v1/health/live` are added for deployment healthchecks and future release-smoke tests.

The readiness service checks database reachability, Redis reachability, object-storage configuration, and the lifecycle state of the reminder, backup, export, report, ETA, and automation workers. Database failure is always readiness-blocking. Redis, external object storage, and workers are required only when the deployment sets `REDIS_REQUIRED=true`, `OBJECT_STORAGE_REQUIRED=true`, or `WORKERS_REQUIRED` is not false in production. Local filesystem storage and optional development/test workers are represented truthfully without falsely blocking readiness.

Failure responses contain stable safe codes such as `database_unreachable`, `redis_unreachable`, `worker_not_started`, and `worker_stopped`; upstream exception messages, connection strings, passwords, and raw provider details are not returned. Readiness returns HTTP 503 when a required check fails and HTTP 200 when required checks are healthy, while optional degradation remains visible in the response status.

Fastify now generates a safe request ID when no valid `X-Request-ID` is supplied, accepts only bounded identifier characters for propagated IDs, returns `X-Request-ID` to callers, includes the ID in health payloads, and passes it into the structured HTTP logger’s custom properties. Existing logger redaction paths remain active.

Worker start/stop registration is additive. It does not change worker processing behavior; it records lifecycle state around the existing start and stop functions. The reminder service is now explicitly stopped during graceful shutdown so its readiness state and actual lifecycle remain consistent.

## Configuration

The shared environment contract now supports `APP_COMMIT_SHA`. The environment templates document `REDIS_REQUIRED`, `OBJECT_STORAGE_REQUIRED`, `WORKERS_REQUIRED`, and `APP_COMMIT_SHA`. The stale process-wide `INSTAPAY_WALLET` entry was removed from `.env.example`, matching Function 10’s removal of that unused runtime field.

Local and production Compose backend healthchecks now use `/api/v1/health/ready`. The root `/health` endpoint remains available for external liveness checks and compatibility smoke tests.

## Validation evidence

| Validation | Result |
|---|---|
| Focused Workstream A suite | **1 file, 6 tests passed** |
| Backend full suite | **46 files passed, 301 tests passed; 13 files and 46 tests skipped** |
| Frontend full suite | **13 files passed, 49 tests passed** |
| Shared/backend/frontend type checks | Passed |
| Production build | Passed |
| `git diff --check` | Passed |

The focused tests cover healthy dependencies, required Redis failure, optional Redis degradation, worker lifecycle, configured version/commit identity, readiness/live aliases, request IDs, HTTP 503 behavior, and safe redaction of upstream failure messages.

## Not included yet

This slice does not implement Prometheus/OpenTelemetry metrics, authenticated Playwright fixture setup, full critical-workflow E2E coverage, migration CI gates, Docker image smoke orchestration, deployment promotion, vulnerability scanning, or release runbooks. Those belong to the later Function 11 workstreams and must not be treated as complete based on this health/readiness change alone.
