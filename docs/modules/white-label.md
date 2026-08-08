# Module Doc: white-label

**Location:** `packages/backend/src/modules/white-label/`

---

## Purpose
Tenant branding and custom domains: brand identity, theme overrides, domain mapping, and public-facing tenant pages (incl. SEO).

## Responsibilities
- Tenant brand config (logo, colors, name, favicon)
- Custom domain mapping (`tenant_domains`)
- Theme injection into frontend (CSS variables)
- Public tenant pages (booking, portal) with structured data

## Functional Requirements
- Manage branding assets (logo uploads → MinIO)
- Map custom domains + verification
- Serve themed frontend per tenant/domain
- Public pages: clinic info, doctors, booking link

## Non-Functional Requirements
- Domain resolution fast (cached); TLS via platform (Vercel/nginx)
- Brand changes reflected without full redeploy

## Business Rules
- Domain verified before active; one primary domain per tenant
- Brand assets validated (type/size); fallback to default theme
- Unpaid/suspended tenants keep default branding (noindex)

## Database Entities
`tenant_branding`, `tenant_domains`, `tenant_data_residency` (related).

## API Endpoints
`/api/v1/white-label` (branding, domains, public tenant pages).

## User Permissions
Tenant owner (own branding); platform admin (verify domains, manage all).

## Dependencies
storage (MinIO assets), frontend theming, saas-billing (entitlement), SEO module.

## Internal Architecture
Service + repository; frontend reads theme from `/white-label/theme` per domain at boot.

## Data Flow
Upload brand assets → store (MinIO) → update `tenant_branding` → frontend fetches theme → CSS variables applied. Add domain → verify (DNS record) → activate → route.

## Validation Rules
Zod: domain format, color hex, asset MIME/size, URL fields.

## Error Handling
`ConflictError` (domain in use), `ValidationError`, `NotFoundError`.

## Security Considerations
- RBAC; domain hijacking prevention (verification); assets served with tenant scoping; no PII in public pages

## Logging & Monitoring
Domain activation audit; asset upload logs; theme fetch latency.

## Test Strategy
Module tests: branding CRUD, domain verification flow, theme payload shape.

## Future Improvements
- Theme editor UI; per-branch branding; locale-specific domains (`/ar` on custom domain).

---

*Related: [Design system](../product/DESIGN-SYSTEM.md) · [SEO](../product/SEO.md) · [SaaS billing](saas-billing.md)*
