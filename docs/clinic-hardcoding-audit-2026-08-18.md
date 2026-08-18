# Final Clinic Hardcoding Audit

**Repository:** Health-ERP  
**Commit:** `004cabe`  
**Branch:** `main`  
**Date:** 2026-08-18

## Scope

The audit covered tracked operational backend, frontend, shared configuration, appointment, billing, payment, portal, kiosk, queue, communication, document, and clinic-shell code. Test fixtures, seed data, and provider-specific integration modules were classified separately from production clinic identity and regional assumptions.

## Production defects fixed

| Area | Finding | Resolution |
|---|---|---|
| Tenant registration | New tenants inherited hardcoded `SAR` and `Asia/Riyadh` settings. | Registration now reads the canonical clinic registry defaults for currency and timezone. |
| Telemedicine | Appointment links used the retired `meet.visionhealthcare.com` domain. | Links now use the configured application URL and the internal `/telemedicine/room-*` route. |
| Clinic identity | The clinic identity response did not expose configured contact email. | The identity endpoint and frontend shell type now expose `clinic.contact.email`; the 404 support action uses it dynamically. |
| Developer Portal | Quick-start curl example used a branded API hostname. | The example now derives the active API base URL from runtime configuration and browser origin. |
| Authentication UI | Login contained a `vision` tenant placeholder and a hardcoded English subtitle. | The tenant label, placeholder, and subtitle now use localized neutral clinic-management translations. |
| Application metadata | Sentry release, shared app name, and SMTP sender had retired vendor branding. | Branding was replaced with the neutral product name or a local-safe configured fallback. |
| Stripe billing | Checkout defaulted to `sar` and used a generic hardcoded product fallback. | Currency now resolves from effective clinic configuration when omitted; the Stripe product label uses the configured clinic display name. |
| Patient and portal validation | Patient, kiosk, voice, and WhatsApp flows assumed Egyptian phone and 14-digit Egyptian national-ID formats. | Generic phone and national-identifier validators now support clinic-issued identifiers and international/local phone formats without country assumptions. |
| Public portal defaults | Patient mobile, kiosk, and queue display flows silently defaulted to the demo tenant. | They now require an organization code from session or URL context and display localized guidance when it is missing. |
| Pharmacy reference UI | Static drug reference records carried unused EGP prices and an Egypt-market label. | Unused regional prices were removed; generic drug interaction reference data remains available. |
| User-facing examples | Phone, identifier, and timezone examples contained Egypt-specific formats. | Examples and translations now use neutral international/local guidance. |

## Intentional exceptions retained

The following values remain because they are part of explicit provider or domain integrations rather than generic clinic identity:

| Exception | Reason |
|---|---|
| ETA financial deepening uses EGP, a 14% VAT rate, and ETA-specific payload fields. | This module is explicitly an Egyptian Tax Authority integration. Generalizing it requires a tax-provider abstraction and country-specific tenant module configuration. |
| Fawry payment URLs contain the Fawry endpoint and `currencyCode=EGP`. | Fawry is an Egypt-specific payment provider with a provider-defined currency contract. |
| InstaPay and ETA naming remain in their integration modules and translations. | These are provider/integration names, not clinic branding. |
| The shared currency catalog contains EGP, SAR, USD, EUR, and AED entries. | These are supported currency reference values; the active clinic currency is selected through the registry-backed clinic setting. |
| Country-code options remain a static reference catalog. | They are selectable global reference data, and the patient portal no longer silently selects one as a clinic default. |
| Demo seed credentials and demo tenant fixtures remain in seed/test code. | They are explicitly invoked for local trials and are not used as production runtime fallbacks. |

## Validation

| Check | Result |
|---|---|
| Shared package build | Passed |
| Frontend TypeScript lint | Passed |
| Backend TypeScript lint | Passed |
| Full test suite | 29 files passed, 1 skipped; 228 tests passed, 3 skipped |
| Production build | Passed |
| `git diff --check` | Passed |
| Remote branch | `origin/main` synchronized at `004cabe` |
| Working tree | Clean |

The test environment still emits non-fatal Redis and audit-log connection warnings when optional local infrastructure is unavailable; these did not cause test failures.

## Follow-up recommendation

If the product must support jurisdictions beyond the retained ETA/Fawry integration, the next separate implementation should introduce a provider- and country-policy layer for tax calculation, e-invoicing, payment rails, national identifiers, and phone normalization. Those concerns should not be reintroduced into the generic clinic core as hardcoded defaults.
