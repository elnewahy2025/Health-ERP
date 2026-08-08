# Risk Register — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Live | **Owner:** Platform lead

---

## 1. Risk Scoring

Likelihood (L) × Impact (I) = Score (1–25); thresholds: ≥ 15 critical, 10–14 high, 5–9 medium, < 5 low.

## 2. Register

| ID | Risk | L | I | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-01 | Data breach of PII (patient records) | 3 | 5 | 15 | RLS, AES-256-GCM, redacted logs, audit trail, incident response, quarterly audit | Security |
| R-02 | Stale build caches cause broken fresh-clone builds | 2 | 4 | 8 | `.tsbuildinfo` gitignored (ADR-014); CI clean build; troubleshooting docs | DevOps |
| R-03 | Third-party outage (SMS/WhatsApp/email/payments) | 3 | 3 | 9 | Channel adapters degrade gracefully; retries; fallback channel; alerts | Backend |
| R-04 | ETA e-invoice rejection (tax compliance) | 3 | 4 | 12 | Schema validation, QR, UUID tracking, submission logs, retry + manual review | Billing |
| R-05 | DB performance degradation at scale | 3 | 4 | 12 | Indexes, pagination, `dw_*` aggregates, read replicas, load-test plan | Backend |
| R-06 | Secrets leakage via env files | 2 | 5 | 10 | `.gitignore`, `_FILE` secrets, boot validation, rotation policy, scanning in CI | DevOps |
| R-07 | Provider AI hallucination in clinical notes | 3 | 4 | 12 | Guardrails, clinician review flag, provenance + cost logs, fallback (ADR-013) | AI |
| R-08 | Refresh token theft/replay | 2 | 5 | 10 | Rotation, hashing, reuse detection, session revocation, lockout | Security |
| R-09 | Single-node infrastructure failure | 3 | 4 | 12 | Docker healthchecks, restart policies, encrypted backups, DR runbook | DevOps |
| R-10 | Frontend bundle bloat → poor LCP | 2 | 3 | 6 | Code splitting, lazy routes, bundle analysis in CI | Frontend |
| R-11 | Team knowledge loss | 3 | 3 | 9 | This documentation package; module docs; ADR log; CONTRIBUTING | All |
| R-12 | Regulatory change (Egyptian data law) | 2 | 4 | 8 | Consent center, retention policies, data residency config, compliance module | Product |
| R-13 | RLS misconfiguration → cross-tenant leak | 2 | 5 | 10 | RLS policies + app-level tenant checks; cross-tenant tests in CI | Backend |
| R-14 | Lock-in to a single AI provider | 2 | 3 | 6 | Provider abstraction + `ai_providers` config (ADR-013) | AI |
| R-15 | Backup restore never tested | 3 | 5 | 15 | Quarterly restore drill; documented runbook (INCIDENT_RESPONSE.md) | DevOps |

## 3. Top 5 (watch list)

1. **R-01** Data breach of PII
2. **R-15** Backup restore never tested
3. **R-04** ETA e-invoice rejection
4. **R-05** DB performance at scale
5. **R-07** AI hallucination in clinical notes

## 4. Review Cadence

- Re-assess every release; security risks at every audit cycle.
- New risks appended with ID; closed risks moved to appendix with resolution note.

---

*Related: [Security](../engineering/SECURITY.md) · [Checkpoint](../core/CHECKPOINT.md) · [Decisions](../core/DECISIONS.md)*
