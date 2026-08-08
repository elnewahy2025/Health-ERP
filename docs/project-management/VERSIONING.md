# Versioning — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Policy

Semantic Versioning (`MAJOR.MINOR.PATCH`) for the platform:

- **MAJOR** — breaking API/schema/behavior changes (e.g., `/api/v2`, breaking migrations).
- **MINOR** — backward-compatible features and improvements.
- **PATCH** — backward-compatible bug and security fixes.

Current platform version: `2.0.0` (branding) / package version `1.0.0` (npm workspaces).
`APP_VERSION` env can override the reported version for monitoring.

## 2. What Increments What

| Change | Major | Minor | Patch |
|---|---|---|---|
| New backward-compatible endpoint | — | ✔ | — |
| New DB table (additive migration) | — | ✔ | — |
| Field added to response (non-breaking) | — | ✔ | — |
| Field removed / renamed in response | ✔ | — | — |
| Breaking schema migration (destructive) | ✔ | — | — |
| Bug/security fix, no contract change | — | — | ✔ |

## 3. API Versioning

- URI prefix: `/api/v1`; next breaking contract → `/api/v2` while v1 is maintained for one deprecation cycle.
- Deprecation headers: `Deprecation: true`, `Sunset: <date>`.
- Non-breaking additions never create a new version.

## 4. Schema/Migration Versioning

- Migrations are sequential numbers (001–029); new changes append (030…).
- Additive migrations are MINOR-compatible; destructive ones require MAJOR + explicit release plan.
- Migration state tracked by knex `knex_migrations` table.

## 5. Tagging & Changelog

- Git tag: `v<MAJOR>.<MINOR>.<PATCH>` on `main`.
- Changelog entries derived from conventional commits; keep user-facing (features/fixes/breaking notes).

## 6. Version Reporting

- `GET /health` and system monitor surface `APP_VERSION`.
- Frontend build embeds version constant for diagnostics.

---

*Related: [Release plan](RELEASE-PLAN.md) · [API specification](../engineering/API-SPECIFICATION.md)*
