# Health-ERP — Incident Response Plan

**Status:** Engineering incident procedure; not a legal notification plan or production approval.

This document provides the broad security-incident process. The implementation-specific procedures for readiness, migration, provider outage, worker recovery, backup/restore, rollback, and tenant isolation are in [OPERATIONS-RUNBOOKS.md](../engineering/OPERATIONS-RUNBOOKS.md). Formal owners remain subject to the release decision log and governance process.

## 1. Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P1 — Critical** | Active data breach, system down, PHI exposed | 15 minutes | SQL injection exploit, ransomware, database leak |
| **P2 — High** | Confirmed vulnerability being exploited, partial outage | 1 hour | Unauthorized admin access, API key leak, DDoS |
| **P3 — Medium** | Suspicious activity, non-critical service degradation | 4 hours | Brute-force attempts, failed login spikes, slow queries |
| **P4 — Low** | Minor issue, no immediate risk | 24 hours | Outdated dependency, minor UI bug, log anomaly |

## 2. Response Team

| Role | Responsibility |
|------|---------------|
| **Incident Commander** | Coordinates response, makes escalation decisions |
| **Security Lead** | Investigates root cause, contains breach |
| **Backend Lead** | Patches code, deploys fixes |
| **DBA** | Database forensics, backup verification |
| **Compliance Officer** | Regulatory notification (PDPL, HIPAA) |

## 3. Response Procedures

### P1 — Critical (Active Data Breach)

1. **Contain** (0-15 min)
   - Revoke compromised credentials immediately
   - Block attacker IPs at infrastructure level
   - If database breach: rotate ALL secrets (JWT, encryption keys, DB passwords)
   - Take system snapshot for forensics (do NOT wipe)

2. **Assess** (15-60 min)
   - Determine scope: which tenants, which data types (PHI, PII, financial)
   - Check audit_logs table for unauthorized access patterns
   - Review login_attempts for brute-force indicators
   - Verify backup integrity

3. **Notify** (1-4 hours)
   - Internal: CTO, legal, compliance
   - External: consult the clinic’s approved jurisdiction-specific privacy and regulatory plan; do not infer a deadline from this document.
   - Notify affected tenants and authorities only through the approved compliance/legal process after facts, scope, and applicable obligations are confirmed.

4. **Remediate** (4-48 hours)
   - Deploy hotfix
   - Rotate all secrets
   - Force password reset for affected users
   - Enable enhanced monitoring

5. **Post-Incident** (1-7 days)
   - Write incident report
   - Identify root cause
   - Implement preventive measures
   - Update this document

### P2 — High (Confirmed Exploit)

1. Block the attack vector
2. Revoke compromised tokens/sessions
3. Deploy fix within 4 hours
4. Audit affected data
5. Document and review

### P3 — Medium (Suspicious Activity)

1. Monitor and log
2. Investigate within 4 hours
3. Apply fix within 24 hours
4. No external notification required unless PII confirmed

### P4 — Low (Minor Issue)

1. Log in tracking system
2. Schedule fix for next sprint
3. No immediate action required

## 4. Communication Templates

### Internal Alert
```
[SEVERITY] Incident #[ID] — [Brief Description]
Status: Investigating / Contained / Resolved
Impact: [Scope of affected users/data]
Next Update: [Time]
Incident Commander: [Name]
```

### Tenant Notification (P1 — PHI Exposure)
```
Subject: Security Incident Notification — Vision Healthcare ERP

Dear [Tenant],

We are writing to inform you of a security incident that may have affected
your data. On [Date], we detected [brief description].

What happened: [Description]
What data was involved: [Types of data]
What we are doing: [Remediation steps]
What you can do: [Recommended actions]

We take the protection of your data seriously and have implemented additional
security measures to prevent future incidents.

For questions, contact: security@visionhealthcare.com
```

## 5. Regulatory and privacy coordination

This repository does not select a jurisdiction, controller/processor model, legal basis, or notification deadline for a clinic. The privacy/compliance owner must identify the applicable jurisdiction and use the approved legal/regulatory plan to determine whether notification is required, to whom, and by when. The incident record must preserve the factual timeline, affected tenant/data categories, containment actions, and evidence used for that decision.

Do not make a legal notification commitment from this document alone. The release decision log records the current Development-only boundary and the requirement for named owners and approved evidence.

## 6. Post-Incident Review Checklist

- [ ] Root cause identified
- [ ] Timeline documented
- [ ] Impact assessed (tenants, data types, records)
- [ ] Remediation verified
- [ ] Preventive measures implemented
- [ ] This document updated
- [ ] Team debriefed
- [ ] Operations runbook updated when the incident exposed a deployment, readiness, migration, worker, provider, backup/restore, rollback, or tenant-isolation gap
- [ ] Release decision log or risk register updated when the incident changes release status
