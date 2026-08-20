# Test-Only Seeded Acceptance Evidence

**Assessment date:** 20 August 2026  
**Acceptance harness commit:** `427c185` — `test: add guarded seeded acceptance harness`
**Branch-aware patient commit:** `98606ed` — `feat: enforce patient branch ownership`
**Purpose:** Controlled engineering acceptance only  
**Production status:** Unchanged — **Development only**

## 1. Harness boundary

The acceptance harness is implemented in [`packages/backend/scripts/acceptance-seed.ts`](../../packages/backend/scripts/acceptance-seed.ts). It creates synthetic fixtures exclusively through the public API. It does not insert records directly into PostgreSQL, does not invoke the existing development/demo seed, and does not introduce production defaults or real clinic data.

Execution is fail-closed. The caller must set `ACCEPTANCE_ENABLE=true`, `ACCEPTANCE_DATABASE_NAME` must contain `test`, `e2e`, or `staging`, and `NODE_ENV=production` is refused even when the database name appears disposable. Generated identifiers use a unique acceptance namespace, generated passwords, reserved `.example.test` identities, and synthetic values. The manifest is written with mode `0600` to `e2e/.auth/acceptance-fixtures.json`, which is ignored by Git and removed after the run.

The harness materializes canonical hospital role templates through the supported RBAC clone API before creating role users. Each tenant receives a tenant administrator, physician, receptionist, billing officer, pharmacist, registered nurse, and pharmacy technician fixture. Each tenant also receives two branches, three departments, two synthetic patients, one appointment, one invoice, one pharmacy inventory item, and one prescription. Tenant Settings and branch working hours are configured through the supported Settings API. Billing and pharmacy are entitled and activated using test-only module calls; provider, SMS, voice, tax, payment, and AI side effects are not invoked.

## 2. Acceptance execution

The harness ran against the disposable `health_erp_patient_branch_e2e_gate` database and produced two tenants with unique namespaces. The run used the new patient branch migration and assigned the two synthetic patients to different tenant branches. The following manifest-backed Playwright suite completed successfully:

| Acceptance specification | Result |
|---|---:|
| Role-based permission and operational-surface distinction | Passed |
| Tenant Settings and cross-tenant record isolation | Passed |
| Appointment, billing, inventory, and prescription fixture workflows | Passed |
| **Total** | **3/3 passed** |

The role assertion verified distinct grants for tenant administration, physician, receptionist, billing officer, pharmacist, registered nurse, and pharmacy technician. It explicitly verified that pharmacist and pharmacy-technician permissions differ and that billing-officer and receptionist permissions differ. The isolation assertion verified tenant-specific Settings identity values, cross-tenant denial for patient and invoice reads, branch list isolation, and same-tenant branch denial: the pharmacist could read the patient assigned to its branch but could not read the patient assigned to the other branch. The workflow assertion verified an appointment through a receptionist-scoped session, an invoice through the tenant-scoped administrative context, pharmacy inventory through a pharmacist-scoped session, and the prescription through the tenant-scoped administrative context.

The existing authenticated critical suite was also previously run successfully with **4/4 tests passed**, covering browser session restoration, tenant-scoped branch/patient/invoice/principal reads, cross-tenant denial, and unauthenticated protection. That suite remains separate from the new multi-role seeded suite.

## 3. Teardown and retention behavior

The new `acceptance:teardown` command reads only its own protected manifest and uses only manifest-owned identifiers. It cancels the synthetic appointment idempotently, soft-deletes the synthetic patients, deactivates the synthetic staff users, and deactivates the synthetic branches and departments through their public APIs. Immutable invoice, audit, prescription, and inventory rows remain isolated in the disposable tenant/database during API teardown; this is intentional because the current public API does not expose destructive deletion for those records.

The final run then stopped the backend, confirmed that ports `3000` and `5173` were not listening, dropped the disposable `health_erp_patient_branch_e2e_gate` database, and removed the protected `e2e/.auth` manifest. No synthetic credentials, access tokens, cookies, patient payloads, or fixture metadata remain in the working tree.

## 4. Repository quality gates

The implementation passed the repository quality gates after the seeded run:

| Gate | Result |
|---|---:|
| Backend unit tests | Passed |
| Frontend unit tests | Passed |
| Monorepo lint/type checks | Passed |
| Monorepo build | Passed |
| Acceptance seed script explicit TypeScript check | Passed |
| Acceptance specifications | **3/3 passed** |
| Guard refusal without explicit disposable settings | Passed |

## 5. Branch-aware patient contract now covered

The patient branch limitation identified by the first seeded run has been resolved in this follow-on slice. Migration `072_patient_branch_contract.ts` adds a nullable, tenant-linked `patients.branch_id` with a supporting index. Authenticated single-patient creation and bulk import now validate the requested branch against the active tenant and assigned branches; branch-scoped actors are refused when no unambiguous assigned branch exists. The patient response contract, frontend registration form, and guarded authenticated E2E fixture now carry the branch identifier. The public patient-portal approval path passes `branchId: null` explicitly because it has no authenticated branch context and must be assigned later by an authorized staff workflow.

## 6. Governance boundary

This evidence proves controlled engineering behavior only. Synthetic acceptance data does not prove clinical safety, hospital SOP alignment, finance/accounting reconciliation, interoperability conformance, jurisdictional privacy compliance, representative backup/restore, performance targets, staff training, usability, pilot exit, or production go-live approval. The development-only boundary and **G0 BLOCKED** decision remain unchanged. No hospital governance approval, named owner, jurisdiction, pilot department, real dataset, or production integration was invented by this work.

## References

- [Acceptance seed and teardown script](../../packages/backend/scripts/acceptance-seed.ts)
- [Seeded acceptance specifications](../../e2e/tests/acceptance/seeded-acceptance.spec.ts)
- [Authenticated critical journeys](../../e2e/tests/authenticated-critical.spec.ts)
- [Patient branch migration](../../packages/backend/migrations/072_patient_branch_contract.ts)
- [Pre-production acceptance plan](preproduction-acceptance-plan-2026-08-20.md)
- [Phase 1 gate](phase-1-gate.md)
