# Phase 1 Baseline Gate — G0

**Gate:** Governance and scope freeze
**Assessment date:** 2026-08-18
**Current release state:** Development only
**Decision:** **BLOCKED — NOT PASSED**

## Gate criteria

| Criterion | Evidence | Status |
|---|---|---|
| Intended use and explicit non-goals documented | `intended-use-and-scope-freeze.md` | PASS — document created; formal approval pending |
| Release states and stop-ship policy documented | `SHIP-READINESS-PLAN.md` and `release-decision-log.md` | PASS — policy documented |
| Initial engineering risk register created | `risk-register.md` | PASS — repository-based baseline created; hospital-specific assessment pending |
| Named product, clinical, security, privacy, finance, interoperability, SRE, support, and release owners | `roles-and-owners.md` | **FAIL — all required owners are unassigned** |
| Pilot hospital/legal entity identified | Intended-use table | **FAIL — no hospital supplied** |
| Country and regulatory jurisdiction identified | Intended-use table | **FAIL — no jurisdiction supplied** |
| Pilot department and workflow scope identified | Intended-use table | **FAIL — no pilot supplied** |
| Authoritative existing system during pilot identified | Intended-use table | **FAIL — no system supplied** |
| Patient-data classification and permitted dataset identified | Intended-use table | **FAIL — no data decision supplied** |
| Required external interface inventory identified | Intended-use table | **FAIL — no hospital interface inventory supplied** |
| Baseline repository status reproducible | Git history, build/test logs, clean tree | PASS — repository is clean; current test evidence is recorded in the assessment |
| Production claim frozen | `DEC-0001` | PASS — current decision is development-only |

## Why the gate is blocked

The missing inputs are not safe to infer. A real product plan requires the actual pilot hospital, jurisdiction, departments, workflows, data authority, required interfaces, and named accountable reviewers. Inventing those values would create false evidence and violate the no-hallucination release rule.

## Exact blocking inputs

The gate owner must supply the following values in writing:

1. Pilot hospital/legal entity name and sponsor.
2. Country, regulatory jurisdiction, and privacy/retention obligations.
3. First pilot department and the exact workflows permitted in the pilot.
4. Existing authoritative system during parallel operation.
5. Whether pilot data is synthetic, de-identified, or real and formally approved.
6. Required integrations: identity, laboratory, radiology/PACS, pharmacy, insurance, payment, messaging, and reporting.
7. Named owners listed in `roles-and-owners.md`, including their decision authority and contact path.
8. The target date or release window, if one exists.

## Gate rule

Until all blocking inputs are supplied and approved, Phase 1 is **BLOCKED**. Phase 2 may not be marked passed, and clinical implementation work may not be presented as pilot-ready. Engineering may perform non-clinical preparatory work, but it may not claim that the gate has passed.

## Reassessment record

| Reassessment | Date | Result | Approver | Evidence |
|---|---|---|---|---|
| Initial G0 assessment | 2026-08-18 | BLOCKED | Unassigned | This document and linked governance documents |
