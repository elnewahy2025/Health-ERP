# Test-Only Seeded Acceptance Evidence

**Assessment date:** 20 August 2026  
**Implementation commit:** `427c185` — `test: add guarded seeded acceptance harness`  
**Purpose:** Controlled engineering acceptance only  
**Production status:** Unchanged — **Development only**

## 1. Harness boundary

The acceptance harness is implemented in [`packages/backend/scripts/acceptance-seed.ts`](../../packages/backend/scripts/acceptance-seed.ts). It creates synthetic fixtures exclusively through the public API. It does not insert records directly into PostgreSQL, does not invoke the existing development/demo seed, and does not introduce production defaults or real clinic data.

Execution is fail-closed. The caller must set `ACCEPTANCE_ENABLE=true`, `ACCEPTANCE_DATABASE_NAME` must contain `test`, `e2e`, or `staging`, and `NODE_ENV=production` is refused even when the database name appears disposable. Generated identifiers use a unique acceptance namespace, generated passwords, reserved `.example.test` identities, and synthetic values. The manifest is written with mode `0600` to `e2e/.auth/acceptance-fixtures.json`, which is ignored by Git and removed after the run.

The harness materializes canonical hospital role templates through the supported RBAC clone API before creating role users. Each tenant receives a tenant administrator, physician, receptionist, billing officer, pharmacist, registered nurse, and pharmacy technician fixture. Each tenant also receives two branches, three departments, two synthetic patients, one appointment, one invoice, one pharmacy inventory item, and one prescription. Tenant Settings and branch working hours are configured through the supported Settings API. Billing and pharmacy are entitled and activated using test-only module calls; provider, SMS, voice, tax, payment, and AI side effects are not invoked.

## 2. Acceptance execution

The harness ran against the disposable `health_erp_e2e_gate` database and produced two tenants with unique namespaces. The following manifest-backed Playwright suite completed successfully:

| Acceptance specification | Result |
|---|---:|
| Role-based permission and operational-surface distinction | Passed |
| Tenant Settings and cross-tenant record isolation | Passed |
| Appointment, billing, inventory, and prescription fixture workflows | Passed |
| **Total** | **3/3 passed** |

The role assertion verified distinct grants for tenant administration, physician, receptionist, billing officer, pharmacist, registered nurse, and pharmacy technician. It explicitly verified that pharmacist and pharmacy-technician permissions differ and that billing-officer and receptionist permissions differ. The isolation assertion verified tenant-specific Settings identity values, cross-tenant denial for patient and invoice reads, and branch list isolation. The workflow assertion verified an appointment through a receptionist-scoped session, an invoice through the tenant-scoped administrative context, pharmacy inventory through a pharmacist-scoped session, and the prescription through the tenant-scoped administrative context.

The existing authenticated critical suite was also previously run successfully with **4/4 tests passed**, covering browser session restoration, tenant-scoped branch/patient/invoice/principal reads, cross-tenant denial, and unauthenticated protection. That suite remains separate from the new multi-role seeded suite.

## 3. Teardown and retention behavior

The new `acceptance:teardown` command reads only its own protected manifest and uses only manifest-owned identifiers. It cancels the synthetic appointment idempotently, soft-deletes the synthetic patients, deactivates the synthetic staff users, and deactivates the synthetic branches and departments through their public APIs. Immutable invoice, audit, prescription, and inventory rows remain isolated in the disposable tenant/database during API teardown; this is intentional because the current public API does not expose destructive deletion for those records.

The final run then stopped the backend, confirmed that ports `3000` and `5173` were not listening, dropped the disposable `health_erp_e2e_gate` database, and removed the protected `e2e/.auth` manifest. No synthetic credentials, access tokens, cookies, patient payloads, or fixture metadata remain in the working tree.

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

## 5. Known engineering limitation recorded honestly

The current patient registration API does not accept or persist a branch identifier in its public create contract. Consequently, the harness does not claim that a branch-scoped billing officer or pharmacist can read the invoice or prescription created from those patients; it verifies those records with the tenant administrator while verifying branch-scoped appointment and inventory access separately. This is a real implementation boundary, not hidden by test data or bypassed with direct database writes. A future, separately approved change may add an explicit active-branch patient-registration contract and corresponding migration/API/UI tests.

## 6. Governance boundary

This evidence proves controlled engineering behavior only. Synthetic acceptance data does not prove clinical safety, hospital SOP alignment, finance/accounting reconciliation, interoperability conformance, jurisdictional privacy compliance, representative backup/restore, performance targets, staff training, usability, pilot exit, or production go-live approval. The development-only boundary and **G0 BLOCKED** decision remain unchanged. No hospital governance approval, named owner, jurisdiction, pilot department, real dataset, or production integration was invented by this work.

## References

- [Acceptance seed and teardown script](../../packages/backend/scripts/acceptance-seed.ts)
- [Seeded acceptance specifications](../../e2e/tests/acceptance/seeded-acceptance.spec.ts)
- [Authenticated critical journeys](../../e2e/tests/authenticated-critical.spec.ts)
- [Pre-production acceptance plan](preproduction-acceptance-plan-2026-08-20.md)
- [Phase 1 gate](phase-1-gate.md)
