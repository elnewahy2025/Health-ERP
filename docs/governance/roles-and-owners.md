# Product Governance Roles and Owners

**Document status:** Draft for assignment
**Release state:** Development only

No person or organization is assigned by this document. Empty assignments are blocking conditions for the corresponding release gate.

| Governance role | Required responsibility | Assigned person/organization | Evidence of assignment | Gate impact if empty |
|---|---|---|---|---|
| Product owner | Scope, priorities, release decision log, change control | **UNASSIGNED** | Written appointment | G0 blocked |
| Hospital sponsor | Business ownership and go-live authority | **UNASSIGNED** | Sponsor approval | G0/G10/G11 blocked |
| Clinical safety lead | Clinical hazard log, safety requirements, clinical acceptance, stop-ship authority | **UNASSIGNED** | Named qualified clinician and appointment | G0/G4/G10/G11 blocked |
| Physician champion | Physician workflow review and acceptance | **UNASSIGNED** | Department appointment | G1/G3/G4/G10 blocked |
| Nursing lead | Nursing workflow and training acceptance | **UNASSIGNED** | Nursing leadership appointment | G1/G5/G10 blocked |
| Pharmacy lead | Medication, formulary, dispensing, controlled-drug acceptance | **UNASSIGNED** | Pharmacy leadership appointment | G1/G4/G5/G10 blocked |
| Laboratory lead | Laboratory workflow and result-safety acceptance | **UNASSIGNED** | Laboratory leadership appointment | G1/G4/G5/G10 blocked |
| Radiology lead | Radiology workflow and report-safety acceptance | **UNASSIGNED** | Radiology leadership appointment | G1/G4/G5/G10 blocked |
| HIM/records lead | Record integrity, amendments, disclosure, retention, migration | **UNASSIGNED** | HIM appointment | G1/G4/G10/G11 blocked |
| Finance/revenue-cycle lead | Billing, claims, reconciliation, accounting acceptance | **UNASSIGNED** | Finance appointment | G1/G6/G10 blocked |
| Privacy/compliance owner | Jurisdiction, privacy, retention, consent, incident obligations | **UNASSIGNED** | Written appointment | G0/G2/G11 blocked |
| Security lead | Threat model, penetration test, security exceptions, incident response | **UNASSIGNED** | Written appointment | G0/G2/G9/G11 blocked |
| Interoperability lead | Hospital interface inventory, mappings, conformance, provider coordination | **UNASSIGNED** | Written appointment | G0/G7/G11 blocked |
| Data migration lead | Source mapping, cleansing, reconciliation, migration rollback | **UNASSIGNED** | Written appointment | G3/G10/G11 blocked |
| DevOps/SRE lead | Environments, monitoring, backup, restore, DR, deployment, rollback | **UNASSIGNED** | Written appointment | G0/G9/G11 blocked |
| Support/training lead | Training, support desk, escalation, knowledge base | **UNASSIGNED** | Written appointment | G10/G11 blocked |
| Release approver | Final release board decision | **UNASSIGNED** | Signed release approval | G12 blocked |

## Governance operating rules

The clinical safety lead may stop work or block a release for a patient-safety concern. The security lead may block a release for a critical security or privacy concern. The finance lead may block a release for unreconciled financial behavior. The hospital sponsor controls whether the pilot or production system may be used for real operational work.

No AI-generated review, automated test, or engineering judgment substitutes for these named approvals. Reviewers must record their own decision, date, scope, evidence, and any accepted residual risk.

## Assignment gate

This register is **NOT APPROVED** while required owners are unassigned. The product cannot pass the baseline governance gate until the owner names, qualifications where relevant, organizations, delegated authority, and escalation contacts are recorded.
