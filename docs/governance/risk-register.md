# Health-ERP Release Risk Register

**Document status:** Initial engineering baseline
**Release state:** Development only
**Last reviewed:** 2026-08-18

Risk status uses four states: **Open**, **Mitigated**, **Accepted**, and **Closed with evidence**. A risk is not closed because code exists; it is closed only when the required evidence is attached and the accountable owner signs it.

| ID | Risk | Evidence or reason | Severity | Current status | Required treatment | Owner |
|---|---|---|---|---|---|---|
| R-001 | Clinical workflows may not match the pilot hospital’s SOPs. | No hospital, department, jurisdiction, or signed workflow pack is recorded in the repository. | Critical | Open | Obtain canonical workflows and clinical acceptance scripts. | Clinical safety lead — unassigned |
| R-002 | Medication safety behavior may be incomplete or clinically unsafe. | The repository has pharmacy and EMR functionality, but clinical validation, formulary governance, interaction data, and alert validation are not evidenced. | Critical | Open | Complete medication hazard analysis, decision-support validation, and pharmacy sign-off. | Pharmacy lead — unassigned |
| R-003 | Diagnostic result workflow may not safely handle critical, amended, or unverified results. | Laboratory and radiology modules exist, but clinical result-safety acceptance and external LIS/RIS/PACS evidence are absent. | Critical | Open | Define result lifecycle, critical escalation, amendments, acknowledgment, and interfaces. | Laboratory/radiology leads — unassigned |
| R-004 | Authorization scope bypass may remain in untested endpoints, exports, reports, jobs, or files. | The 39-role authorization refactor is implemented, but full database-backed adversarial coverage is not complete. | High | Open | Run tenant/branch/department/patient/resource/IDOR matrix against real PostgreSQL and object storage. | Security lead — unassigned |
| R-005 | Emergency-access behavior may be over-broad if grants are assigned without a dedicated scope decision. | Break-glass endpoints require `emergency_access.manage`; ordinary clinical roles currently do not receive it by default. | High | Open | Approve intended emergency-access users, scope, reason, duration, notification, and review process. | Clinical safety/security leads — unassigned |
| R-006 | Audit failures may be silently accepted. | The audit unit test logged a database insert error while passing because the service catches the exception. | High | Open | Add real PostgreSQL audit-write integration tests and fail critical workflows when mandatory audit writes fail. | Security/SRE leads — unassigned |
| R-007 | Dashboard may display misleading demo activity or trend data. | Current frontend contains hardcoded activity names, invoice identifiers, and percentage changes. | High | Open | Replace with scoped server-derived data or remove the cards. Add production-build scan. | Product/frontend owners — unassigned |
| R-008 | Financial data may not be sufficient for accounting-grade reconciliation and close. | Billing, payments, expenses, claims, and reports exist, but finance acceptance and ledger/period-close evidence are absent. | Critical | Open | Define chart of accounts, posting, reconciliation, reversal, refund, claim, and period-close requirements. | Finance lead — unassigned |
| R-009 | External interoperability may be implied but not proven. | FHIR export labels exist, but no hospital-specific profiles, CapabilityStatement, HL7/LIS/RIS/PACS contract, or conformance evidence is recorded. | High | Open | Obtain interface inventory and complete sandbox conformance tests. | Interoperability lead — unassigned |
| R-010 | Backup configuration may not equal recoverability. | Docker backup services are configured, but a completed restore and disaster-recovery rehearsal is not evidenced. | Critical | Open | Execute restore, point-in-time/recovery procedure where supported, RPO/RTO measurement, and sign-off. | SRE lead — unassigned |
| R-011 | Real-world usability and training burden are unknown. | No supervised hospital pilot or formal role-based user acceptance is recorded. | High | Open | Run scripted pilot with representative staff and measure errors, completion time, workarounds, and support load. | Hospital sponsor/support lead — unassigned |
| R-012 | Data migration may create duplicates, omissions, or incorrect clinical history. | No source hospital dataset, mapping, cleansing rules, reconciliation, or rollback evidence is recorded. | Critical | Open | Define migration contract, counts/checksums, clinical sample review, and rollback. | Data migration/HIM leads — unassigned |
| R-013 | Release claims may exceed evidence. | A previous static audit report declares production readiness, while several required clinical and operational gates remain unperformed. | High | Open | Freeze production-ready claims until G0–G12 evidence is complete. | Product owner — unassigned |
| R-014 | Jurisdictional privacy and retention requirements are unknown. | Country, regulator, patient-data classification, retention period, and incident obligations have not been supplied. | Critical | Open | Identify jurisdiction and complete privacy/compliance assessment before real patient data. | Privacy/compliance owner — unassigned |
| R-015 | Integration/provider outages may cause silent loss or duplicate operations. | Messaging, payments, storage, and external integration services are environment-dependent; provider failure/replay evidence is absent. | High | Open | Add idempotency, durable failure queues, replay controls, monitoring, reconciliation, and outage tests. | Integration/SRE leads — unassigned |

## Risk acceptance rule

No Critical risk may be accepted for a Production Hospital Release without written approval from the named accountable owner, the hospital sponsor, and the release approver, including a compensating control, expiry date, and explicit scope. Critical clinical, privacy, security, data-integrity, backup, and unreconciled-finance risks are normally release-blocking and should not be accepted for the first production release.

## Phase 1 disposition

The register is complete as an initial repository-based inventory, but it is not closed. Hospital-specific risks cannot be assessed until the pilot hospital, jurisdiction, workflows, interfaces, data sources, and responsible owners are supplied.
