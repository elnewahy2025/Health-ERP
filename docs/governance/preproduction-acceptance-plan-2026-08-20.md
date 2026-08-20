# Health-ERP Pre-Production Operational Acceptance Plan

**Assessment date:** 20 August 2026  
**Current release state:** **Development only**  
**Assessment decision:** **G0 remains BLOCKED — NOT PASSED**

## 1. Purpose and non-negotiable boundary

This plan is the next step after completion of Function 11 Workstreams A–E. It converts the repository’s strict ship-readiness requirements into an evidence-led acceptance program for a real clinic or hospital sponsor. It does not declare the product clinically safe, legally compliant, production-ready, or suitable as a hospital system of record.

> **No engineering evidence can substitute for the missing pilot hospital, jurisdiction, named accountable owners, clinical acceptance, financial reconciliation, representative restore drill, interoperability evidence, training, or formal go-live approval.**

The historical `docs/FINAL_AUDIT_REPORT.md` contains a July 2026 “READY” statement based on an older repository state. That statement is superseded for release decisions by the current Development-only governance documents and must not be used as approval evidence.

## 2. Evidence status legend

| Status | Meaning |
|---|---|
| **Engineering evidence available** | Repository tests, CI gates, migration evidence, E2E evidence, or documented controls exist for the stated engineering property. |
| **Partial — external acceptance required** | Engineering evidence exists, but a real clinic/hospital owner, representative workflow, external account, independent review, or operational rehearsal is still required. |
| **Blocked — required input absent** | The required hospital, jurisdiction, owner, data, interface, or approval has not been supplied. No safe assumption may fill the gap. |
| **Not applicable yet** | The gate cannot be executed until an earlier blocked gate supplies its scope and owner. |

## 3. Gate-to-evidence map

| Gate | Acceptance requirement | Current repository evidence | Required owner | Environment/evidence artifact | Status and blocking reason |
|---|---|---|---|---|---|
| G0 | Governance and scope freeze | Intended-use document, owner register, risk register, release decision log | Product owner, hospital sponsor, clinical safety, privacy, security, SRE, finance, interoperability, support | Signed scope freeze, named-owner register, jurisdiction/data/interface decisions | **Blocked.** All required owners are unassigned; hospital, jurisdiction, department, authoritative system, permitted dataset, and interfaces are TBD. |
| G1 | Canonical workflow sign-off | Repository modules, role/page coverage, Function 11 E2E critical journeys | Department leads and clinical safety lead | Approved workflow packs and acceptance scripts for patient identity, ADT, clinical record, diagnostics, pharmacy, nursing, revenue, supply chain, and reporting | **Blocked.** No real hospital SOP or department representative has signed the workflows. |
| G2 | Security and privacy approval | Workstream D security/configuration gate, dependency audit, non-BYPASSRLS check, tenant-scope engineering tests; [test-only seeded acceptance evidence](test-only-seeded-acceptance-evidence-2026-08-20.md) | Security lead and privacy/compliance owner | Independent penetration test, privacy assessment, session/CSRF/audit review, emergency-access decision, signed security acceptance | **Partial.** Engineering controls and seeded tenant-scope checks pass, but independent testing, privacy review, jurisdictional obligations, and emergency-access approval are absent. |
| G3 | ADT pilot readiness | Patient, appointment, branch/department, and authentication implementation plus seeded E2E checks; [test-only seeded acceptance evidence](test-only-seeded-acceptance-evidence-2026-08-20.md) | Reception, nursing, physician, administrator, clinical safety lead | Scripted trained-user ADT run, conflict/duplicate/downtime evidence, audit review | **Blocked.** Synthetic tenant journeys pass, but no pilot department, trained users, authoritative system, or downtime/re-entry procedure is supplied. |
| G4 | Clinical safety approval | Pharmacy-safety, clinical, nursing, diagnostics code and tests exist | Clinical safety, pharmacy, laboratory, radiology, nursing leads | Hazard analysis, alert/override review, clinical failure-mode tests, signed safety acceptance | **Blocked.** No qualified clinical reviewers or hazard-log sign-off exists. |
| G5 | Department acceptance | Specialty modules and role/scope controls exist | Pharmacy, laboratory, radiology, nursing, operations leads | Two-week scripted sandbox exercise per released department, including denial, reversal, and downtime cases | **Blocked.** No department scope, representatives, training, or acceptance reports exist. |
| G6 | Finance approval | Billing/provider-payment/manual reconciliation engineering and integration tests | Finance/revenue-cycle lead | Independently calculated invoice/payment/refund/claim/reconciliation/period-close pack | **Blocked.** No finance owner, chart-of-accounts decision, accounting authority, or independent reconciliation evidence exists. |
| G7 | Interoperability approval | Provider adapters, ETA/Fawry/Stripe/Twilio/AI boundaries, API contracts | Interoperability lead and hospital IT | Hospital interface inventory, FHIR/HL7/LIS/RIS/PACS/identity contracts, sandbox conformance and replay reports | **Blocked.** No hospital interface inventory, target profiles, credentials, or conformance acceptance exists. |
| G8 | UX and prototype removal | Production build, bundle secret scan, dynamic settings/role gates, seeded E2E smoke; [test-only seeded acceptance evidence](test-only-seeded-acceptance-evidence-2026-08-20.md) | Product owner, clinic administrator, accessibility/user representative | Production-build scan, accessibility/localization/responsive review, role task completion and error-state report | **Partial.** Engineering scans and seeded browser checks pass, but real representative usability, accessibility, localization, and training evidence is absent. |
| G9 | Evidence package | A–E Function 11 evidence notes, unit/integration/E2E/build/security results, runbooks, and [test-only seeded acceptance evidence](test-only-seeded-acceptance-evidence-2026-08-20.md) | Release owner, SRE, security, database operator | Traceability matrix, performance/load report, backup/restore recording, DR rehearsal, open-defect and exception register | **Partial.** Engineering and seeded evidence exists, but Docker/Trivy runtime execution, performance baselines, representative restore, DR rehearsal, and signed exceptions are not complete. |
| G10 | Supervised pilot exit | Disposable E2E and runbooks establish the test method | Hospital sponsor, clinical safety lead, pilot department owners | De-identified/approved pilot results, reconciliation, support metrics, safety/data-integrity incident review, signed exit report | **Blocked.** No pilot hospital, department, dataset, parallel authoritative system, training, or exit criteria results exist. |
| G11 | Training, operations, and go-live readiness | Workstream E runbooks, deployment/release procedures, role catalog | Hospital sponsor, support/training, SRE, clinical and privacy owners | Role training completion, downtime guide, support escalation, migration/retention/archival decisions, go-live checklist | **Partial.** Engineering runbooks exist, but owner assignment, role-specific training, support coverage, data migration decisions, and hospital approval are absent. |
| Final shipment | Production Hospital Release | No current approval; governance remains Development only | Formal release board and all accountable owners | Complete evidence package, signed go-live decision, scope/departments/integrations/support/rollback approval | **Blocked.** Multiple critical gates and formal approvals remain incomplete. |

## 4. Owner assignment required before execution

The owner register is currently draft and every required assignment is `UNASSIGNED`. The first operational action is to record a named person or organization, qualification/authority, escalation contact, and evidence location for each role.

| Required role group | Minimum appointment | Why it blocks acceptance |
|---|---|---|
| Product and governance | Product owner, hospital sponsor, release approver | Controls scope, stop-ship, pilot authority, and final decision. |
| Clinical safety | Clinical safety lead, physician champion, nursing, pharmacy, laboratory, radiology, HIM leads | Approves clinical workflows, hazards, records, diagnostics, medication, and department safety. |
| Privacy and security | Privacy/compliance owner, security lead | Determines jurisdiction, data classification, retention, incident obligations, penetration-test acceptance, and emergency access. |
| Finance and interoperability | Finance/revenue-cycle lead, interoperability lead, hospital IT | Approves reconciliation and identifies required external interfaces and authoritative contracts. |
| Data and operations | Data migration lead, DevOps/SRE lead, support/training lead | Owns migration reconciliation, backup/restore/DR, deployment/rollback, monitoring, training, and support. |

## 5. Required written inputs from the clinic or hospital

The following inputs must be supplied in writing before G0 reassessment:

1. Legal entity, pilot hospital or clinic organisation, sponsor, and target release scope.
2. Country, regulatory jurisdiction, privacy/retention obligations, and data-controller/processor responsibilities.
3. First pilot department and exact workflows allowed in the pilot; all excluded workflows must remain explicitly out of scope.
4. Existing authoritative system during parallel operation and the reconciliation boundary between systems.
5. Dataset decision: synthetic, de-identified, or real data with documented approval, permitted fields, retention, and access controls.
6. Required interfaces: identity/SSO, laboratory, radiology/PACS, pharmacy, insurance, payment, messaging, reporting, and any local standards or vendor APIs.
7. Named owners and their decision authority, escalation path, and availability during pilot and go-live.
8. Pilot dates, support hours, rollback window, target acceptance metrics, and pilot exit criteria.

## 6. Acceptance execution order

Acceptance must proceed in this order; later gates must not be marked passed while an earlier blocking gate remains unresolved.

| Order | Action | Exit evidence |
|---:|---|---|
| 1 | Reassess G0 with signed owners, intended use, jurisdiction, pilot scope, authoritative system, dataset, and interface inventory. | G0 decision record marked PASS or explicitly remains BLOCKED. |
| 2 | Convert the selected pilot workflows into department-owned acceptance scripts. | Versioned workflow pack with actors, permissions, scopes, transitions, audit events, downtime, and expected results. |
| 3 | Execute G1/G2/G3/G4/G5 in a controlled, de-identified or approved-data staging environment. | Signed workflow, security/privacy, ADT, clinical safety, and department reports. |
| 4 | Execute G6/G7/G8 with independent finance, hospital IT, accessibility/usability, and provider owners. | Reconciliation, interface conformance, usability, localization, and provider sandbox reports. |
| 5 | Complete G9 evidence package, including performance, Docker/Trivy, representative restore, DR, open-defect, and traceability evidence. | Evidence index with immutable artifact references and reviewed exceptions. |
| 6 | Run the supervised G10 pilot with parallel operation and daily safety/data reconciliation. | Pilot daily reports, incident/defect closure, training/support metrics, and signed exit report. |
| 7 | Complete G11 training, support, migration, retention, downtime, and go-live readiness. | Training and support records, migration/retention decisions, and go-live checklist. |
| 8 | Convene the formal release board for final shipment decision. | Signed scope-specific release decision; otherwise state remains Development or Controlled Pilot. |

## 7. Evidence package structure

The acceptance repository should contain an index with stable references to the following artifacts. Sensitive clinical data, credentials, tokens, raw provider payloads, and personally identifying information must not be committed to the repository.

```text
acceptance/<release-id>/
  00-release-decision.md
  01-owner-appointments.md
  02-scope-jurisdiction-data.md
  03-workflow-packs/
  04-clinical-safety-and-hazard-review.md
  05-security-privacy-review.md
  06-finance-reconciliation/
  07-interoperability-conformance/
  08-performance-and-load/
  09-backup-restore-dr/
  10-pilot-daily-reports/
  11-training-support/
  12-open-defects-and-exceptions.md
  13-final-go-live-decision.md
```

Each artifact must state its environment, test data classification, commit/build identity, date/time in UTC, operator, reviewer, scope, result, limitations, and follow-up owner. A failed or skipped critical test must have an explicit exception with owner, expiry, compensating control, and release decision; “not tested” is not equivalent to pass.

## 8. Seeded engineering acceptance result

The guarded multi-role seeded harness passed **3/3 acceptance specifications**: role-grant distinction, Tenant Settings and cross-tenant isolation, including same-tenant branch denial, and appointment/billing/inventory/prescription fixture workflows. The existing authenticated critical suite separately passed **4/4 journeys**, and the unauthenticated E2E subset passed **13/13**. The branch-aware patient contract was migrated and exercised through public APIs, including distinct patient ownership across two branches. The new harness used the disposable `health_erp_patient_branch_e2e_gate` database, two unique synthetic tenants, supported clinic Settings/RBAC/module APIs, and no provider side effects. Its manifest-scoped teardown completed before the database and protected manifest were removed. This strengthens engineering evidence only; it does not change any governance gate.

## 9. Current decision

The correct decision remains **G0 BLOCKED — NOT PASSED**. Engineering may continue non-clinical preparation in a controlled environment, but no person may label Health-ERP production-ready, use it as a hospital system of record, or claim clinical acceptance based only on the completed repository work. The next safe action is to obtain the written inputs in Section 5 and assign the roles in Section 4.

## References

- [Strict hospital product ship-readiness plan](../architecture/SHIP-READINESS-PLAN.md)
- [Phase 1 baseline gate](phase-1-gate.md)
- [Product governance roles and owners](roles-and-owners.md)
- [Intended use and scope freeze](intended-use-and-scope-freeze.md)
- [Release risk register](risk-register.md)
- [Release decision log](release-decision-log.md)
- [Operational runbooks](../engineering/OPERATIONS-RUNBOOKS.md)
- [Cumulative implementation status](../modular-settings-implementation-status-2026-08-19.md)
