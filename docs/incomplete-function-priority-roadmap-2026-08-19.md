# Incomplete Clinic ERP Functions and Implementation Priority Roadmap

**Project:** Health-ERP Clinic Management System  
**Audit date:** 19 August 2026  
**Purpose:** Stop expanding foundation work and identify the main incomplete operational functions that must be completed for real clinic use.

## Executive conclusion

The application is not empty or merely a demo. It already contains substantial tenant configuration, RBAC, appointment management, patient records, billing, pharmacy, laboratory, radiology, communications, audit, provider callbacks, and PostgreSQL tenant-isolation work. However, several functions currently expose a successful-looking status without performing the underlying business operation. Those are the gaps that should now receive priority.

The most important point is that **clinical safety and data integrity must come before additional integrations or AI features**. The next implementation cycle should therefore stop adding generic provider infrastructure and complete the operational workflows that can currently mislead staff: pharmacy dispensing, backup and restore, data export/download, reporting output, and regulatory or manual-payment boundaries.

> **Recommended next coding slice:** harden pharmacy prescribing, inventory, and dispensing into a clinically safe transactional workflow. It is the highest direct patient-safety gap. Immediately after that, implement real backup and restore verification before adding more optional integrations.

## Priority definitions

| Priority | Meaning | Release rule |
|---|---|---|
| **P0 — ship blocker** | A function can cause direct clinical harm, permanent data loss, privacy non-compliance, or a false operational success state. | Must be implemented and tested before presenting the system as production-ready. |
| **P1 — operationally important** | The function is needed for a serious clinic’s daily administration, regulatory operations, or reliable financial control, but does not normally create immediate clinical harm. | Required for a complete first commercial release or must be explicitly labelled manual-only. |
| **P2 — defer until core is complete** | Valuable functionality that is currently incomplete but is not necessary for safe patient care, accounting, or data protection. | Implement only after P0 and P1 acceptance criteria pass. |

## P0 — functions that must be completed first

### 1. Pharmacy medication safety and inventory integrity

The pharmacy routes currently allow prescription creation with weak input validation, do not prove that each prescribed item exists in the clinic’s catalog, and do not perform allergy, interaction, duplicate-therapy, dose, route, or contraindication checks. Dispensing updates prescription items and decrements inventory without a transaction, without verifying that the item belongs to the prescription and tenant, without preventing negative stock, and without enforcing lot expiry or batch selection. These behaviors are visible in `packages/backend/src/modules/pharmacy/index.ts:131-178`.

This is the highest direct patient-safety priority when the pharmacy module is activated. It is not enough to distinguish Pharmacist and Pharmacy Technician permissions; the underlying clinical and stock controls must also prevent unsafe or impossible actions.

| Required capability | Acceptance condition |
|---|---|
| Prescription validation | A prescription must contain at least one valid item, dosage, route, frequency, quantity, and duration according to the configured clinical rules. |
| Patient safety checks | Active allergies, documented contraindications, duplicate therapy, and known interactions are checked before signing or dispensing. Any override requires an explicit reason, authorized role, and audit event. |
| Catalog and tenant binding | Each item resolves to a tenant-owned catalog or inventory record. No update may target a prescription item or inventory row belonging to another tenant. |
| Stock and lot control | Dispensing occurs inside a transaction with row locks, rejects expired lots and insufficient stock, supports batch/lot selection, and never allows negative stock. |
| Partial dispensing and refills | Remaining quantity, refill count, and prescription status are calculated server-side and are idempotent under repeated requests. |
| Audit and authorization | Prescribing, approval, dispense, reversal, adjustment, and override actions record actor, reason, patient, drug, quantity, lot, and timestamp. Existing RBAC remains mandatory. |

### 2. Real database backup, restore, and disaster-recovery verification

The DR module currently creates a `running` row and then uses `setTimeout` to mark it completed with a random size and a checksum beginning with `simulated-`; it does not create a database snapshot, upload an artifact, verify the checksum, or perform a restore. The DR test only updates a timestamp and healthy status. The evidence is in `packages/backend/src/modules/dr-backup/index.ts:65-130`.

This must not remain exposed as a completed backup feature. A clinic could believe it has a recoverable backup when it has only a database row. The production implementation needs a durable background worker rather than an in-request timer, because backups may outlive the HTTP request and must survive process restarts.

| Required capability | Acceptance condition |
|---|---|
| Real artifact creation | A configured job produces an actual encrypted PostgreSQL backup or approved snapshot, records the exact artifact size and checksum, and fails closed if creation or upload fails. |
| Storage | The artifact is written to configured tenant or deployment storage with explicit retention and access controls. A synthetic path is never returned as a download artifact. |
| Restore verification | A scheduled or administrator-triggered drill restores into an isolated database, runs schema and integrity checks, and records the result without touching production data. |
| Retention | Expired artifacts are deleted only according to the configured retention policy, with audit records retained. |
| Recovery operations | Restore and failover require separate high-privilege authorization, confirmation, audit logging, and a documented rollback path. |
| Scheduling | Recurring backups run through a durable application worker/cron system, not `setTimeout` and not an AI session. A lighter manual-run mode may exist for development, but it must not be labelled automatic backup. |

### 3. Real patient-data export, download, and FHIR mapping

The generic export route counts rows, marks a job completed, calculates a synthetic file size, and stores a synthetic `/exports/...` path without generating file content. The FHIR endpoint returns an empty Bundle and explicitly says that actual data mapping must be configured for production use. The download endpoint returns JSON metadata with a URL rather than streaming or authorizing a real artifact. This is visible in `packages/backend/src/modules/data-export/index.ts:82-176`.

This is a privacy, continuity-of-care, and regulatory portability gap. It is separate from reporting: a patient-data export must preserve tenant isolation, explicit data scope, auditability, and safe handling of sensitive clinical information.

| Required capability | Acceptance condition |
|---|---|
| Actual export generation | CSV and JSON formats contain the selected tenant’s records, selected modules, selected date filters, and declared columns. Record counts are measured from generated output, not estimated. |
| Download security | The download endpoint checks tenant ownership and permission at request time, streams or serves a short-lived authorized artifact, and never exposes another tenant’s path. |
| FHIR R4 mapping | Patient, Encounter, Appointment, Observation, MedicationRequest, MedicationDispense, DiagnosticReport, Organization, Practitioner, and relevant billing resources are mapped from real tables with documented omissions. |
| Sensitive-field policy | Each export type declares whether it includes identifiers, contacts, clinical notes, payment data, or deleted records. Export creation and download are audited. |
| Failure recovery | Partial jobs are marked failed, artifacts are deleted or quarantined, and retries do not duplicate or silently overwrite prior exports. |

## P1 — functions required for a serious first release

### 4. Real report execution and report-file download

The report execution route inserts a pending execution, immediately marks it completed with `row_count: 0`, and returns a message that results will be available shortly. The export route returns a download URL, but the module does not generate or stream a report file. The evidence is in `packages/backend/src/modules/reports/index.ts:138-161`.

The implementation should reuse the durable export/job infrastructure created for patient-data export, but report definitions must apply their own tenant, branch, department, date, and permission scopes. A report must never claim completion before its actual file exists and passes a readable-output check.

### 5. ETA e-invoicing submission and configurable tax/document rules

ETA draft generation exists, but `/api/v1/eta/invoices/:id/submit` intentionally returns HTTP 409 because the provider business contract is not implemented. The local draft also contains Egypt-specific values such as activity code `8610`, GS1 item metadata, VAT type `T1`, VAT rate `14`, and currency `EGP` in `packages/backend/src/modules/financial-deepening/index.ts:207-254`.

This should be implemented only as a real country/provider adapter, not by pretending that a locally generated JSON document is an accepted tax invoice. The adapter must obtain activity code, tax profile, document series, tax rules, certificate/signing material, endpoint, environment, status polling, rejection handling, and idempotency from the tenant’s regional/provider settings. Non-Egypt tenants must not inherit these values.

### 6. InstaPay must be explicitly manual or fully integrated

The current InstaPay route creates a local pending transaction and returns a wallet identifier or `PENDING_CONFIG`. It does not verify an external transfer, receive a trusted callback, reconcile amount and invoice, or finalize payment. This is in `packages/backend/src/modules/financial-deepening/index.ts:560-622`.

There are two acceptable product states. The safer immediate state is to rename and present it as **manual bank/wallet transfer instructions**, with staff confirmation and a controlled reconciliation workflow. The complete state requires a verified provider or bank contract, callback or statement reconciliation, idempotency, amount matching, and fraud-resistant confirmation. It must not be displayed as an integrated online payment rail while it only creates a local reference.

### 7. Automation rules must execute actions, not only log configurations

Automation CRUD and manual triggering exist, but the trigger loop currently records each action’s configuration as `completed`; it does not dispatch email, SMS, WhatsApp, task, billing, or webhook actions. The relevant execution code is `packages/backend/src/modules/automation/index.ts:278-348`.

The next real implementation should define a small allowlisted action registry, validate action configuration, execute each action through existing tenant-aware services, record per-step results, enforce cooldown and maximum executions atomically, and retry only idempotent actions. Event-triggered rules need durable event records or an outbox; recurring rules need a durable worker. The system should not claim an automation completed merely because its JSON configuration was read.

### 8. Correct administrative permission boundaries in incomplete modules

Several configuration-style routes still use broad view permissions for mutations. For example, backup-config creation and DR configuration updates use `dr_backup.view`, while automation rule creation and updates use `automation.view` in the current module. These are not merely cosmetic issues: they allow a user who can inspect a function to mutate it if the route is reachable.

Before implementing the workers, exports, or automation actions, each mutation route must be reviewed against the existing 39-role RBAC model. Create, edit, approve, execute, restore, revoke, and view must remain distinct. Module activation must not grant those permissions automatically.

## P2 — valuable, but not before the core is safe

### 9. AI chat completion is currently a logging endpoint

The AI chat route inserts an `ai_requests` row with `status: 'completed'` and returns “AI request logged. Provider integration required for actual completion.” It does not produce a model response. This is in `packages/backend/src/modules/ai-hub/index.ts:263-284`.

This should either be implemented with a configured, tenant-safe model gateway that records prompt/response/cost/error states correctly, or be labelled unavailable and prevented from presenting a completed result. It should not be prioritized ahead of medication safety, backup, export, or financial/regulatory correctness. Clinical AI must remain assistive, auditable, and explicitly non-diagnostic unless a separate clinical governance process is completed.

### 10. Remove or replace dead hardcoded financial utilities

`packages/backend/src/services/payment.ts:11-74` contains a hardcoded currency conversion table and a simplified legacy ETA QR helper. The active ETA path uses a separate TLV helper, and the search did not find operational call sites for these legacy exports, so this is not the first production blocker. It should nevertheless be removed or replaced with tenant/provider configuration before claiming that the generic clinic core is fully dynamic.

### 11. Vendor sandbox and production verification for remaining providers

Fawry now has a tenant-configured signed request boundary, but a real clinic administrator still needs to test it with actual sandbox credentials and callback delivery. Stripe checkout and webhook confirmation use the Stripe SDK and existing tenant checks, but provider-account authentication, idempotency, return behavior, and sandbox reconciliation still need a dedicated end-to-end test. ETA and Twilio need their own verified vendor contracts before business operations are claimed complete.

## Functions that are not currently the next priority

The following work should not be repeated as if it were incomplete: tenant-scoped settings, provider secret redaction, RBAC and custom-role foundations, branch and department scope enforcement, payment callback hardening, Fawry request signing structure, authenticated FORCE RLS transaction routing, and the Fastify commit/rollback lifecycle tests are already implemented and validated.

ETA submission being returned as `PROVIDER_OPERATION_NOT_SUPPORTED` is currently an intentional safety boundary, not a defect in the authorization model. It becomes a production gap only when the clinic chooses ETA and supplies the required vendor contract, credentials, certificates, tax profile, and test environment.

## Recommended implementation order

| Order | Slice | Why this order |
|---:|---|---|
| 1 | Pharmacy clinical-safety and transactional dispensing | Direct patient-safety risk and data-integrity risk. It is self-contained and does not require a vendor contract. |
| 2 | Real backup artifact, durable job, restore drill, and retention | Prevents catastrophic data loss and removes the most misleading simulated feature. |
| 3 | Real export/download infrastructure and FHIR resource mapping | Provides privacy-safe portability and becomes reusable for report files and backup artifact delivery. |
| 4 | Report execution and file download | Completes a daily administrative function using the export/job infrastructure. |
| 5 | RBAC boundary audit for automation/DR/configuration mutations | Prevents operational privilege escalation before more background workers are enabled. |
| 6 | ETA provider adapter and configurable tax rules | Required only for tenants that activate the Egypt tax module; must be country/provider-specific. |
| 7 | InstaPay manual-mode clarification or verified external reconciliation | Prevents staff from confusing a manual reference with a confirmed payment. |
| 8 | Automation action execution and durable event/cron processing | Valuable after the job and audit infrastructure is real. |
| 9 | Stripe sandbox end-to-end verification and remaining provider adapters | Important integrations, but not ahead of direct clinical and data-safety gaps. |
| 10 | AI chat completion and other optional intelligence features | Defer until core clinical, financial, backup, and export workflows are reliable. |

## Background execution architecture decision

Backup, export, report, and automation work should run through a durable application job mechanism with a persistent queue or database-backed job table, a worker that survives HTTP request completion, retry and idempotency rules, and an administrator-visible execution log. A lighter manual-only implementation is acceptable temporarily for development or very small installations, but it must be labelled manual and cannot claim scheduled execution, automatic backup, or completed report generation.

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---|---|
| Durable in-application worker with scheduled jobs and an event/outbox table | Reliable across request completion and process restarts; supports retries, audit, and growing workload. Requires deployment support for a worker or persistent scheduled process. | Infrastructure cost depends on hosting; operationally appropriate for production. | Medium. |
| Manual administrator-triggered jobs with no automatic schedule | Easier to implement and operate initially; does not provide automatic backup, event-triggered automation, or guaranteed report completion. | Lowest initial cost. | Low, but not sufficient for a full production claim. |

The recommended production approach is the durable worker. It should be implemented inside the application’s existing deployment model with deterministic code and explicit job state; it should not rely on an AI session or a short-lived HTTP timer for recurring or event-triggered work.

## Definition of “main functions complete”

The application should not be described as a fully production-ready clinic ERP until the P0 items pass executable tests and operational drills. At minimum, a release candidate must prove that pharmacy dispensing cannot create unsafe or negative inventory states, a backup can be restored in an isolated environment, a data export creates and authorizes a real artifact, and every endpoint reports failure when the underlying operation did not occur. P1 modules may be activated progressively, but their UI must clearly distinguish integrated, manual, unsupported, and not-configured states.

## Repository evidence

The audit is grounded in the current source rather than feature names or menu labels. The primary evidence files are `packages/backend/src/modules/pharmacy/index.ts`, `packages/backend/src/modules/dr-backup/index.ts`, `packages/backend/src/modules/data-export/index.ts`, `packages/backend/src/modules/reports/index.ts`, `packages/backend/src/modules/automation/index.ts`, `packages/backend/src/modules/financial-deepening/index.ts`, `packages/backend/src/modules/ai-hub/index.ts`, and `packages/backend/src/services/payment.ts`. The raw search inventory is preserved in `docs/incomplete-function-audit-raw.txt` and `docs/incomplete-function-audit-focused.txt` for traceability.
