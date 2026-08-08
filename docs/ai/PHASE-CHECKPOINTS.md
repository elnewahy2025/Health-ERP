# Phase Checkpoints — Vision Healthcare ERP (for AI Agents)

**Purpose:** Milestone gates that must be satisfied before an AI agent (or team) proceeds to the next phase.

---

## 1. Phase Gate Definition

Each gate is verified by CI + documentation review. A phase is complete when its
**DoD** (IMPLEMENTATION-PLAN.md §4) passes and this file is updated.

## 2. Gates

### P0–P2 Foundation & Clinical Core
- [x] Monorepo builds (shared → backend)
- [x] Auth + tenancy + RBAC tested
- [x] Patient → appointment → EMR → billing loop working
- [x] Migrations 001–005 applied cleanly

### P3–P5 Operations, Platform & Egypt Market
- [x] Pharmacy/lab/radiology/queue/insurance workflows
- [x] Reports, BI, notifications, HR, CRM, compliance
- [x] NID validation, ETA e-invoice, Fawry/InstaPay, EN/AR RTL
- [x] Multi-branch, white-label, subscriptions, exports

### P6–P7 Intelligence & Hardening
- [x] AI hub/intelligence with fallback + cost logs
- [x] Security audit: zero critical/high
- [x] Build hygiene: `.tsbuildinfo` untracked; zero type errors; tests pass

### P8 Documentation & Release Readiness (current)
- [ ] All docs in `docs/index.md` complete and consistent
- [ ] Module docs for all major modules complete
- [ ] e2e smoke suite expanded (3 → 8 specs)
- [ ] Release automation exercised once

## 3. How to Mark a Gate Complete

1. Run verification commands (`npm run build`, `npm test`, e2e).
2. Update `CHECKPOINT.md` (completed/pending).
3. Update this file: tick the gate, add date + verifier.
4. Record any new decisions in `DECISIONS.md`.

## 4. Blocked Gates

If a gate cannot complete, document the blocker in CHECKPOINT.md (Current Blockers),
link the risk register entry, and do not mark the gate complete.

---

*Related: [Checkpoint](../core/CHECKPOINT.md) · [Implementation plan](../core/IMPLEMENTATION-PLAN.md)*
