# Module Doc: compliance

**Location:** `packages/backend/src/modules/compliance/` (+ `compliance-reports`, `audit`, `dr-backup`)

---

## Purpose
Regulatory and security compliance: policies, audits, data retention, consent, breach management, and disaster recovery.

## Responsibilities
- Compliance policies + audits + reports
- Data retention policies + purge
- Consent logs + breach log
- DR backup configs/executions (S3, encrypted)
- Audit log access (append-only)

## Functional Requirements
- Manage policies; run compliance audits
- Generate compliance reports
- Retention schedules per entity; purge jobs
- Consent recording for data use
- Backup execution tracking + restore runbook

## Non-Functional Requirements
- Audit logs append-only; access restricted
- Retention purges anonymize before delete
- Backup encryption + retention configurable
- RPO ≤ 24 h, RTO ≤ 4 h target

## Business Rules
- Policies versioned; audits reference policy version
- Consent required for marketing/comms channels
- Backup encryption mandatory (`BACKUP_ENCRYPTION_KEY`)

## Database Entities
`compliance_policies`, `compliance_audits`, `compliance_reports`, `data_retention_policies`, `data_consent_logs`, `breach_log`, `audit_logs`, `dr_configs`, `backup_configs`, `backup_executions`.

## API Endpoints
`/api/v1/compliance` (policies, audits, reports), `/api/v1/audit` (logs), `/api/v1/dr-backup`.

## User Permissions
`compliance:manage`, `audit:view` (platform admin), `dr:manage`.

## Dependencies
audit service, storage (S3), notification (alerts), all modules (retention scoping).

## Internal Architecture
Service + repository; purge/backup jobs via BullMQ.

## Data Flow
Policy change → version bump + audit. Scheduled purge → enumerate entities per retention → anonymize/delete → log. Backup job → dump → encrypt → S3 → record execution.

## Validation Rules
Zod: retention windows, policy schema, consent purpose enum, backup config.

## Error Handling
`ForbiddenError` (audit access), `ValidationError`, job failures → alert + retry.

## Security Considerations
- Append-only audit; RBAC-restricted access
- Encrypted backups; retention enforcement; breach notification process (INCIDENT_RESPONSE.md)

## Logging & Monitoring
Audit access attempts; backup success/failure metrics; purge job results; alerts on missed backups.

## Test Strategy
`compliance.test.ts` — policy lifecycle, retention calculation, backup execution recording.

## Future Improvements
- SOC 2 evidence collection; automated policy scanning; data-residency enforcement.

---

*Related: [Security](../engineering/SECURITY.md) · [DR/backup](../engineering/DEPLOYMENT.md) · [Risk register](../project-management/RISK-REGISTER.md)*
