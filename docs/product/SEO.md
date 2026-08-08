# SEO — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Applicability:** marketing/landing content only

---

## 1. Context

This is a SaaS application behind authentication; the SPA is not publicly indexable for
core functionality. SEO applies to:

- Public marketing/landing pages (if served from the same repo/frontend build)
- Tenant white-label portals and public pages (online booking, kiosk, portal login)
- Generated content such as clinic landing pages exposed via `white-label` custom domains

## 2. Technical Baseline (SPA)

| Item | Approach |
|---|---|
| Meta tags | per-page `title`, `description`, canonical, `og:` tags via a small SEO component |
| Crawling | SPA is rendered client-side; public marketing pages use pre-rendered HTML (or Vite prerender) |
| `robots.txt` | allow public paths; disallow `/app`, `/portal`, auth pages |
| Sitemap | generated for public marketing/tenant pages |
| Structured data | `MedicalClinic` / `Physician` schema on tenant public pages |
| Performance | Core Web Vitals: LCP < 2.5 s, CLS < 0.1 (Vite build, code splitting) |
| Mobile | responsive + viewport meta (already standard) |
| Canonical/duplicate | canonical per locale (`/en`, `/ar`); hreflang alternates for multilingual public pages |
| RTL/SEO | Arabic pages use `lang="ar" dir="rtl"` — affects how search engines rank Arabic content |

## 3. Multilingual SEO

- Locale-prefixed URLs for public content (`/en`, `/ar`).
- `hreflang="en"`, `hreflang="ar"`, `x-default`.
- Translated meta descriptions (never machine-translated without review).

## 4. Tenant Pages (White-Label)

- Each tenant can publish public pages: clinic name, services, doctors, booking link.
- Unique URL via `tenant_domains`; structured data generated per tenant.
- Keep noindex for unverified/unpaid tenants.

## 5. Measurement

- Analytics/telemetry (see ANALYTICS.md) tracks public page performance separately from app usage.
- Search Console verification recommended per tenant domain.

## 6. Non-Goals

- SEO for authenticated app pages (indexing blocked by auth).
- Paid acquisition tooling.

---

*Related: [Analytics](ANALYTICS.md) · [White-label module](../modules/white-label.md)*
