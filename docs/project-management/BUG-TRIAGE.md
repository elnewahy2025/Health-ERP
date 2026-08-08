# Bug Triage — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Severity Definitions

| Severity | Definition | Examples | SLA (first response) |
|---|---|---|---|
| Critical | Data loss/leak, security breach, full outage, blocked billing | PII exposure, RLS bypass, DB outage | 2 h |
| High | Core flow unusable with no workaround | Cannot book appointments, invoice fails | 8 h |
| Medium | Workaround exists; degraded experience | Report export slow, wrong badge color | 24 h |
| Low | Cosmetic / minor UX | Typo, spacing | 3 days |

## 2. Triage Workflow

1. **Triage** (daily, on-call): classify severity, assign module owner, label (`bug`, `security`, `p0`…).
2. **Reproduce:** confirm steps; attach redacted logs; check if CI/pinned version reproduces.
3. **Fix:** branch `fix/<issue>`; add regression test; run build + tests.
4. **Review & merge:** per CONTRIBUTING.md; security fixes get two reviews.
5. **Release:** patch release for Critical/High (RELEASE-PLAN.md hotfix path).
6. **Verify:** close only after confirming on affected version(s).

## 3. Escalation

- Critical: notify platform lead + security contact immediately (INCIDENT_RESPONSE.md if security).
- Unresolved Medium+ for > 1 release: escalate to sprint planning; track in CHECKPOINT.md.

## 4. Definition of Resolved

- Root cause identified and fixed; regression test added; verified on affected environments;
  release note added; docs updated if behavior changed.

## 5. Metrics (review monthly)

- MTTR by severity; open bug count by severity; bug reopen rate; regression test coverage of fixed bugs.

---

*Related: [Issue template](ISSUE-TEMPLATE.md) · [Testing](../engineering/TESTING.md) · [Risk register](RISK-REGISTER.md)*
