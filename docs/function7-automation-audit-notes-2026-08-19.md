# Function 7 automation audit — 19 August 2026

## Baseline

The repository contains an automation rules API and a frontend management page, but it does not contain a durable automation executor. `packages/backend/src/modules/automation/index.ts` registers rule CRUD, action CRUD, manual triggering, execution-log listing, a hardcoded trigger-event catalog, and a hardcoded action-type catalog. The application bootstrap registers the module but does not start an automation worker or event/outbox processor.

## Confirmed execution gaps

The manual trigger route executes inside the HTTP request. It loads active actions, parses each action configuration, and records the configuration as a `completed` result; it does not dispatch notification, email, SMS, WhatsApp, task, billing, report, inventory, or webhook actions. An action JSON parse failure is the only current action failure path. There is no allowlisted action registry, action-specific schema validation, tenant-aware service dispatch, timeout policy, idempotency key, retry classification, or per-step durable result record.

Maximum-execution and cooldown checks are separate reads performed before insertion and rule timestamp update. They are not serialized with a row lock or atomic claim, so concurrent requests can pass the same limit. The execution count is derived from all execution-log rows rather than a durable rule claim or a clearly defined successful-attempt policy. The route marks a log as running and then completes it in the same request, so process termination can leave no durable queued state and there is no stale-running recovery.

Event-driven rules have no event ingestion/outbox path. The trigger-event list is only a UI catalog; the source modules do not publish durable events to an automation queue. Scheduled rules have no cron parser, next-run calculation, schedule claim, or scheduler loop. Existing report schedules are stored and exposed by the reports module, but the audit found no generic schedule processor. Existing durable worker patterns in report, export, backup, and ETA services use a persistent database state, claim/recover logic, interval lifecycle, and `unref()` timers; Function 7 should reuse those conventions.

## Authorization findings

The automation module currently protects rule creation, update, deletion, and action creation with `automation.view`. This allows a user who can inspect automation definitions to mutate them. Rule execution uses `automation.manage`; action update and deletion use `automation.edit`; log and catalog reads use `automation.view`. The existing permission catalog contains `automation.view`, `automation.create`, `automation.edit`, `automation.delete`, `automation.export`, and `automation.manage`, so the implementation should correct route boundaries without rewriting custom tenant roles. A separate execute permission is not required if `automation.manage` is retained as the execution authority, but the route contract must be explicit and tested.

All database queries must remain tenant-scoped. Rule actions are currently checked through the rule tenant on most paths, but action update/delete should also require the action row and rule row to match the same tenant in one guarded operation. Reference IDs and action payloads must not be allowed to target arbitrary tenants or unapproved tables/services.

## Existing UI contract and gaps

`packages/frontend/src/pages/AutomationPage.tsx` loads rules, logs, and trigger-event metadata. It supports basic rule creation, deletion, and immediate manual triggering. It does not edit existing rules or action steps, show schedule configuration, show event delivery/enqueue state, expose retry state or stale leases, display per-step results, or distinguish queued, running, retry-wait, failed, completed, skipped, and cancelled outcomes.

## Function 7 acceptance boundary

The implementation must introduce a small allowlisted action registry with validated action configuration and deterministic execution through existing tenant-aware services. It must add durable event/job state for manual, event, and scheduled triggers; atomically enforce cooldown and maximum executions; generate and persist an idempotency key for each logical execution; claim jobs with a lease; recover stale claims; retry only explicitly idempotent actions with bounded backoff; persist per-step results and final status; and preserve audit records. Unknown actions, arbitrary database/table mutation, arbitrary outbound URLs, untrusted headers, and unsupported provider operations must fail closed.

The worker must be wired into application startup and graceful shutdown, but remain disabled in lifecycle tests. PostgreSQL integration tests must prove concurrent-limit behavior, event deduplication, retry/stale-lease recovery, action failure visibility, tenant isolation, and mutation/execute permission boundaries. The frontend must expose the durable state without claiming completion before action side effects succeed.
