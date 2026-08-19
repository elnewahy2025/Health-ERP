# Function 7 automation design — 19 August 2026

## Scope

Function 7 will turn the existing automation configuration screens into a real deterministic execution system. It will preserve the current `automation_rules`, `automation_rule_actions`, and `automation_execution_logs` APIs while changing manual triggering from synchronous configuration logging to durable queueing. Event-driven and scheduled rules will use the same execution state machine, so an action never appears completed merely because its JSON configuration was parsed.

The application’s existing backend worker lifecycle remains the execution host. A single interval-driven automation worker will process durable database state, use PostgreSQL row locks with `SKIP LOCKED`, recover stale leases after process interruption, and stop during graceful shutdown and Fastify lifecycle tests. It will not use an AI session, an HTTP `setTimeout`, or an external scheduler as the source of truth.

## Durable state model

Migration 067 will add an additive, forward-safe event and execution model. `automation_events` stores tenant-scoped event deliveries with an idempotency key, event type, reference, payload, status, attempts, retry timing, and lease metadata. A unique tenant/event-key constraint deduplicates repeated source publication. `automation_execution_logs` becomes the durable logical execution job with `queued`, `running`, `retry_wait`, `completed`, `completed_with_errors`, `failed`, `skipped`, and `cancelled` states, an idempotency key, event linkage, attempt/max-attempt fields, next-attempt time, lease ownership/expiry, and safe error metadata. `automation_execution_steps` stores one durable row per rule action with action snapshot, attempt state, idempotency key, timestamps, output metadata, and sanitized error information.

Existing rule rows receive schedule bookkeeping columns such as `next_run_at` and `last_scheduled_at`; the existing `trigger_config` JSON remains the administrator-owned source for the cron expression and optional IANA timezone. Existing action rows remain the source configuration, but each execution snapshots the action configuration into its step rows so later edits cannot change an in-flight job. Existing legacy `automation_logs` rows are not deleted.

## State transitions and claims

Manual trigger requests and event/schedule dispatchers create a `queued` execution only after an atomic transaction locks the rule, verifies that it is active, checks the maximum logical execution count and cooldown, and inserts the unique idempotency key. Maximum executions count logical executions created for the rule, including skipped executions, and cannot be exceeded by concurrent requests. Cooldown starts when a logical execution is accepted, preventing event storms from bypassing the administrator’s configured interval. A cooldown or maximum-limit decision is recorded as a durable `skipped` execution rather than silently disappearing.

The worker claims one pending event or execution at a time with a lease. A lease contains an owner token and expiry timestamp. Stale `processing` or `running` rows are recovered to `retry_wait` or `queued` according to their attempts. Retries use bounded exponential backoff. Only action types explicitly marked idempotent in the action registry may be retried automatically; non-idempotent or unknown actions fail closed. A completed step is never executed again when its parent job is retried. When all steps finish, the parent job becomes `completed` or `completed_with_errors`; if a retryable action exhausts attempts or a non-retryable action fails, the parent becomes `failed`.

## Allowlisted action registry

The first production slice exposes only tenant-aware actions that already have backend services: `send_notification`, `send_email`, and `send_sms`. Each action requires a validated notification template key and a safe recipient path from the event/input payload, or an explicitly permitted clinic contact destination. Variables may be constants or safe dotted paths from the event payload. The action registry invokes the existing notification service, which continues to resolve tenant templates and provider settings. Unknown actions, arbitrary table updates, arbitrary webhook URLs, untrusted request headers, fabricated billing writes, and unsupported provider operations are not exposed.

Conditions use a small deterministic predicate schema over the event/input payload: safe dotted path, operator (`equals`, `not_equals`, `in`, or `exists`), and value. Invalid predicates fail validation when a rule is saved. Conditions that do not match produce a durable `skipped` execution with a reason and no side effect.

## Event and schedule processing

Operational modules will publish selected durable events through a shared `publishAutomationEvent` helper after their successful transaction boundary. The event payload is tenant-owned and contains only the data required by configured actions. Event publication uses a caller-supplied or deterministic reference idempotency key, so retries from the source route do not create duplicate deliveries. The automation worker resolves active event rules, evaluates cooldown/max limits atomically, and enqueues one logical execution per matching rule and event.

Scheduled rules use the existing `trigger_type = schedule` contract and require a valid five-field cron expression parsed by the repository’s existing `cron-parser` dependency. The next run is stored in UTC after interpreting the configured IANA timezone. The worker claims due rules under a row lock, advances `next_run_at` before enqueueing, and records a schedule-triggered execution. Invalid schedules cannot be activated. If a schedule misses one or more intervals while the process is down, the worker creates one catch-up execution and advances to the next future occurrence rather than flooding the clinic with every missed run.

## Authorization and tenant safety

Rule creation uses `automation.create`, updates use `automation.edit`, deletion uses `automation.delete`, action creation/update/deletion uses `automation.edit`, manual execution uses `automation.manage`, and read-only catalogs/logs use `automation.view`. Backend authorization remains mandatory; frontend gates are supplementary. Custom tenant roles are not rewritten. All rule, action, event, execution, and step queries include the authenticated tenant, and every action dispatcher receives the execution tenant ID. Reference IDs are never used to select another tenant’s data.

## User-visible behavior

The automation screen will keep its current rules/logs tabs but add action-step editing for supported actions, schedule configuration, activation validation, and durable execution statuses. Manual triggering will show `queued` rather than claiming immediate completion. Execution logs will expose job attempts, retry timing, lease recovery, final error, and per-step results. The interface will clearly distinguish `queued`, `running`, `retry_wait`, `skipped`, `completed`, `completed_with_errors`, `failed`, and `cancelled`.

## Verification requirements

Focused tests will cover action validation and registry boundaries, cron parsing and timezone calculation, atomic cooldown/max-execution claims, event deduplication, durable queueing, stale-lease recovery, retry classification, per-step idempotency, tenant isolation, permission boundaries, and frontend status rendering. PostgreSQL integration tests will execute migrations 067 and the real worker functions against the test database. The worker will be explicitly disabled when `RUN_FASTIFY_LIFECYCLE_TESTS=true`.
