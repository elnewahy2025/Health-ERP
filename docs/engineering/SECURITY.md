# Security — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved (audit: 2026-07-24, zero critical/high findings)

**Companion docs:** `docs/security/SECURITY_AUDIT.md`, `docs/security/INCIDENT_RESPONSE.md`, `docs/FINAL_AUDIT_REPORT.md`.

---

## 1. Security Posture

Public-internet SaaS. Assumes hostile input, compromised client, and exfiltrated backups.

| Layer | Controls |
|---|---|
| Transport | TLS 1.2+, WSS; Nginx terminates SSL |
| Perimeter | Rate limiting, security headers (HSTS, CSP, X-Frame-Options, Permissions-Policy) |
| Identity | JWT access (15 min, in-memory), rotating refresh (HttpOnly cookie), MFA/TOTP, OTP, email verification |
| Authorization | RBAC roles/permissions; `hasPermission` middleware; tenant scoping via RLS |
| Data | AES-256-GCM app-layer encryption; parameterized queries; sanitization |
| Ops | Non-root containers, Docker secrets, redacted logs, audit trail, encrypted backups |

## 2. Authentication

- bcrypt password hashing (`BCRYPT_ROUNDS`), password strength policy (`isStrongPassword`).
- Lockout after `MAX_LOGIN_ATTEMPTS` (5) for `LOCKOUT_DURATION_MINUTES`; `login_attempts` tracked.
- `MAX_CONCURRENT_SESSIONS` enforced; `user_sessions` revocable.
- Refresh tokens hashed in `refresh_tokens`, rotated per use; pre-rotation checks; reuse detection.
- CSRF: `CSRF_SECRET` + same-site strict cookies + state-changing endpoints require header token.

## 3. Authorization (RBAC)

- `roles` per tenant with `permissions` (jsonb); constants in `@healthcare/shared` (`PERMISSIONS`).
- Guards: `auth-guard.ts` (identity), `authorize-guard.ts` (permission); `hasPermission`/`hasAnyPermission` middleware.
- Admin/platform endpoints additionally enforce RBAC (audit fix).

## 4. Input Validation & Injection

- Zod schemas on every route; strict mode; no implicit `any`.
- SQL: parameterized queries only; no raw user SQL.
- XSS: frontend `sanitize.ts` (`sanitizeString`) on all user input; React escapes by default.
- SSRF: `validateWebhookUrl` requires HTTPS and blocks internal targets.
- File uploads: multipart with size/type constraints; scanned/stored in MinIO with tenant isolation.

## 5. Rate Limiting & Abuse

- `@fastify/rate-limit` global + per-endpoint presets (see API-SPECIFICATION.md §3).
- Lockout, refresh-rate limits, and OTP attempt caps.

## 6. Encryption & Secrets

- `ENCRYPTION_KEY` (AES-256-GCM) for PII; `JWT_SECRET`/`JWT_REFRESH_SECRET` must differ.
- Secrets via env files (`.env`, `.env.docker`) or Docker secrets (`_FILE` convention); never committed.
- `.gitignore` excludes `.env*`; `secrets/` dir excluded.

## 7. Logging & Monitoring

- pino + pino-http with redaction for secrets/tokens/PII.
- Audit events → DB `audit_logs` (actor, action, entity, before/after).
- `system_alerts`, `system_metrics`; Sentry optional (`SENTRY_DSN`); health checks in containers.

## 8. OWASP Top 10 Mitigations

| OWASP | Mitigation |
|---|---|
| A01 Broken Access Control | RBAC + RLS + tenant scoping + authorization guards |
| A02 Cryptographic Failures | TLS, AES-256-GCM, bcrypt, hashed refresh tokens |
| A03 Injection | Parameterized SQL, Zod validation, no raw user SQL |
| A04 Insecure Design | Clean architecture, threat-modeled module review |
| A05 Security Misconfiguration | HSTS/CSP/headers, non-root, env validation on boot |
| A06 Vulnerable Components | Dependabot weekly, lockfile pinning, Node 20 LTS |
| A07 Auth Failures | Lockout, MFA, rotation, session revocation |
| A08 Integrity Failures | Refresh pre-rotation checks, webhook signature verification |
| A09 Logging Failures | Structured logs + DB audit trail + alerting |
| A10 SSRF | HTTPS-only webhook validation, internal-target blocking |

## 9. Audit Trails

- All write operations call `logAudit()` (service `services/audit.ts`).
- Immutable append-only semantics; access restricted to platform admin.

## 10. Backup & Disaster Recovery

- Encrypted S3 backups daily; retention configurable; restore runbook in INCIDENT_RESPONSE.md.
- `docker-compose.prod.yml` includes `backup` service; DR config tables manage execution state.
- Recovery time objective target: RTO ≤ 4 h, RPO ≤ 24 h (default config).

## 11. Data Retention & Privacy

- `data_retention_policies` per entity; purge with anonymization for audit continuity.
- `data_consent_logs`; patient export via `data-export`; consent revocable via portal.

## 12. Secure Development

- Security is part of DoD (IMPLEMENTATION-PLAN.md §4).
- Code review checklist: auth guards, RLS, validation, audit, redaction, secrets.
- Quarterly re-audit; incident-response drills.

---

*Related: [API Specification](API-SPECIFICATION.md) · [Deployment](DEPLOYMENT.md) · [Risk register](../project-management/RISK-REGISTER.md)*
