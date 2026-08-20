# Release Decision Log

**Product:** Health-ERP
**Decision-log status:** Active
**Current release state:** Development only

| Decision ID | Date | Decision | Basis | Approver | Evidence |
|---|---|---|---|---|---|
| DEC-0001 | 2026-08-18 | Do not label Health-ERP production-ready or use it as a hospital system of record. | Repository review identified missing clinical validation, hospital workflow sign-off, interoperability evidence, financial reconciliation evidence, restore rehearsal, pilot evidence, and hardcoded dashboard activity. | **Unassigned — formal release board required** | `docs/architecture/SHIP-READINESS-PLAN.md`; `docs/governance/risk-register.md` |
| DEC-0002 | 2026-08-18 | Begin Phase 1 governance and scope freeze; do not expand broad feature scope until the baseline gate is addressed. | The strict ship-readiness plan requires named owners, target hospital/jurisdiction, pilot scope, authoritative system, and risk ownership before clinical implementation proceeds. | **Unassigned — product owner required** | `docs/governance/intended-use-and-scope-freeze.md`; `docs/governance/roles-and-owners.md` |
| DEC-0003 | 2026-08-18 | Treat the 39-role RBAC implementation as an engineering baseline, not clinical or regulatory approval. | Authorization tests and role/page audits are useful evidence, but they do not replace database-backed adversarial testing, hospital acceptance, or privacy/security sign-off. | **Unassigned — security and clinical owners required** | Commit history and risk register R-004/R-005 |
| DEC-0004 | 2026-08-18 | Adopt the configurable multi-tenant Clinic Management System model. | User approved one tenant per clinic organisation, system/vendor module availability boundaries, tenant-administrator module activation, and a generic clinic core with optional specialty modules. | **User-approved product direction; formal governance owners still unassigned** | `intended-use-and-scope-freeze.md` |
| DEC-0005 | 2026-08-20 | Complete the engineering release-hardening documentation and runbooks without advancing the product to production-approved status. | Function 11 Workstreams A–E now have implementation, CI/security gates, operational procedures, and known-limitations documentation; clinical acceptance, named owners, representative restore sign-off, pilot evidence, and applicable privacy/security approvals remain required. | **Unassigned — formal release board, clinical, privacy/security, and operations owners required** | `docs/engineering/OPERATIONS-RUNBOOKS.md`; `docs/engineering/DEPLOYMENT.md`; `docs/project-management/RELEASE-PLAN.md` |

## Decision rules

A decision may be changed only through a new dated entry that identifies the superseded decision, the new evidence, the impact analysis, the approver, and the release state. Chat messages and unreviewed code changes do not constitute release approval.

A release state may advance only after the applicable phase gate is marked **PASS** with links to test results, signed approvals, migration/recovery evidence, and known-limitations documentation. A failed or incomplete gate remains **BLOCKED**; it may not be converted to “pass with workaround” for clinical, privacy, security, data-integrity, or financial controls.
