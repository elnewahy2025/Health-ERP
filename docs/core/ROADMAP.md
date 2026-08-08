# Roadmap — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Live | **Last updated:** 2026-08-08

---

## Now (0–3 months)

- **Documentation package** — complete `docs/` set (this work), module docs for all major modules
- **E2E expansion** — Playwright specs for billing, insurance claims, HR, notifications
- **Release automation** — tag-driven changelog + deploy pipeline
- **Observability** — `/metrics` endpoint, Prometheus + Grafana stack, alert rules
- **Performance pass** — report/BI endpoints, index review, query profiling

## Next (3–6 months)

- Data warehouse ETL completeness (`dw_*` tables) + scheduled refreshes
- Patient mobile-web PWA installability, offline caching of reference data
- Pharmacy barcode scanning on mobile cameras
- Telemedicine: calendar sync (Google/Outlook), waiting-room notifications
- AI: fine-tuned ICD-10 suggestion model, smart scheduling rollout to all branches
- Multi-currency preparation (reporting only), GDPR-style consent center for Egyptian law

## Later (6–12 months)

- Native mobile apps (React Native) for patients and clinicians
- Marketplace: integration connectors as installable plugins
- Multi-region data residency (`tenant_data_residency` enforcement)
- Hospital edition: bed management, surgical scheduling, HL7/FHIR export
- Automated compliance audits (SOC 2 evidence collection)

## Continuous

- Security: weekly Dependabot, quarterly audit (`docs/security/`), incident-response drills
- Docs: every milestone updates CHECKPOINT.md, ROADMAP.md, DECISIONS.md

---

*Related: [Checkpoint](CHECKPOINT.md) · [Release plan](../project-management/RELEASE-PLAN.md)*
