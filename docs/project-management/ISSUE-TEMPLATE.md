# Issue & Pull Request Templates — Vision Healthcare ERP

**Usage:** copy the relevant block into GitHub issues / PR descriptions.
(Configured in `.github/` — keep in sync with this file.)

---

## 1. Bug Report

```markdown
### Summary
One sentence describing the bug.

### Environment
- Version/commit: `vX.Y.Z` / `abc123`
- Browser + OS: Chrome 130 / Windows 11
- NODE_ENV: development / production
- Stack: Docker / Railway / local

### Steps to Reproduce
1. Go to …
2. Click …
3. Observe …

### Expected
What should happen.

### Actual
What happens (include redacted logs / screenshot).

### Severity
[ ] Critical (data loss / security / full outage)
[ ] High (core flow broken)
[ ] Medium (workaround exists)
[ ] Low (cosmetic)

### Related
- Module: `docs/modules/<module>.md`
- Migration: `0XX_…`
```

## 2. Feature Request

```markdown
### Problem / Opportunity
Why this matters (persona + pain point).

### Proposed Solution
Behavior, screens/endpoints affected.

### Acceptance Criteria
- [ ] …

### Scope Notes
Out of scope / dependencies (module docs, migrations).

### Effort Estimate
S / M / L (+ rationale)
```

## 3. Pull Request

```markdown
### What
Concise description of the change.

### Why
Links issue/requirement ID (e.g., FR-5).

### Testing
- [ ] `npm run build` passes (shared/backend/frontend)
- [ ] `npm test` passes
- [ ] e2e smoke (if applicable)
- [ ] Manual test steps

### Docs
- [ ] Module doc updated (`docs/modules/…`)
- [ ] API-SPECIFICATION / CONFIGURATION updated if applicable
- [ ] DECISIONS.md updated if architectural

### Security Checklist
- [ ] No `any`; Zod validation on inputs
- [ ] RBAC + tenant scoping applied
- [ ] Sensitive fields encrypted; audit logged
- [ ] No secrets/PII in logs; `.env*`/`.tsbuildinfo` not committed
```

## 4. Security Disclosure

Do **not** file public issues for vulnerabilities. Contact maintainers privately;
see `docs/security/INCIDENT_RESPONSE.md` for the disclosure process and timeline.

---

*Related: [Bug triage](BUG-TRIAGE.md) · [Contributing](../engineering/CONTRIBUTING.md)*
