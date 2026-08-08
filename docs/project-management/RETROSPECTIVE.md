# Retrospective — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Live

---

## 1. Process

- Retrospective after each release/milestone (RELEASE-PLAN.md).
- Format: **What went well / What went wrong / What we'll change / Action items.**
- Action items tracked with owner + due date; reviewed at next retro.

## 2. Retrospective — 2026-07 (Hardening Milestone)

**What went well**
- Zero critical/high findings in the security audit; RLS + encryption + refresh rotation landed.
- Full build pipeline stabilized: shared/backend/frontend compile with zero type errors.
- 154 backend tests passing; CI green with real Postgres/Redis services.
- Egypt-market features (NID, ETA, Fawry/InstaPay, AR/RTL) shipped.

**What went wrong**
- Committed `.tsbuildinfo` files caused stale-build failures on fresh clones (ADR-014).
- `@testing-library/dom` peer dependency missing → frontend typecheck failures (ADR-015).
- E2E coverage limited to 3 specs; report/BI performance not yet profiled (CHECKPOINT K-1, K-2).

**What we'll change**
- Documentation-first workflow (this package) — docs are part of DoD.
- Add `.tsbuildinfo`/`.env*` guards to PR checklist and CI scan.
- Expand e2e suite and add bundle-size + load-test gates.

**Action items**
| Action | Owner | Due |
|---|---|---|
| Ship documentation package | Architecture | 2026-08 |
| E2E expansion 3→8 specs | QA | 2026-09 |
| Metrics endpoint + Grafana | DevOps | 2026-09 |
| DB index/query profiling pass | Backend | 2026-09 |

## 3. Retrospective — 2026-05 (Foundation)

**What went well**
- Monorepo + shared types prevented contract drift; Fastify choice scaled with 57 modules.
- RLS-first tenancy designed before multi-tenant growth.

**What went wrong**
- Initial path alias confusion between frontend `paths` and workspace resolution (resolved by exports-map approach; dead alias removed).

**What we'll change**
- Keep resolution through workspace symlinks + `exports` only; no path aliases to source.

## 4. Template for Future Retros

```markdown
## Retrospective — <Milestone>
**What went well** …
**What went wrong** …
**What we'll change** …
**Action items** | Action | Owner | Due |
```

---

*Related: [Checkpoint](../core/CHECKPOINT.md) · [Roadmap](../core/ROADMAP.md)*
