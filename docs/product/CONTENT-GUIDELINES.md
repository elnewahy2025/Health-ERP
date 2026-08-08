# Content Guidelines — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **i18n:** `packages/frontend/src/i18n/en.json` + `ar.json` (2,676 keys)

---

## 1. Principles

1. **Every string is translatable.** No hardcoded UI text in components.
2. **EN and AR parity.** Keys exist in both files; missing keys fail lint/type-check review.
3. **Concise, action-first.** Buttons = verb phrases; headings = nouns; errors = what + how to fix.
4. **Medical accuracy.** Clinical terms must match Egyptian medical conventions; keep Arabic translations reviewed by clinicians.
5. **Consistent terminology.** Same English/Arabic term for the same concept everywhere (glossary below).

## 2. Tone

- Professional, calm, and specific — healthcare staff and patients.
- Errors: state the problem and the next action ("Email already registered. Try signing in.").
- Confirmations: name the entity and consequence ("Cancel appointment #1234? The slot will be released.").
- Never blame the user; never use jargon in patient-facing surfaces (portal, kiosk, surveys).

## 3. i18n Key Structure

- Namespace by domain: `patients.title`, `patients.actions.add`, `appointments.status.confirmed`.
- Flat keys in `en.json`/`ar.json`; component reads via `t('domain.key')`.
- Interpolation via `{{variable}}`; plurals via i18next plural forms.

## 4. Copy Rules

| Context | Rule | Example |
|---|---|---|
| Buttons | verb, ≤ 3 words | "Add patient", "Save" |
| Headings | noun phrase | "Appointment details" |
| Empty states | what's missing + action | "No patients yet. Add your first patient." |
| Toasts | short result | "Invoice #INV-000123 saved" |
| Errors | problem + fix | "Network error. Check your connection and retry." |
| Dates/currency | locale-aware | `formatDate`, `formatCurrency` (EGP) |

## 5. Terminology Glossary (EN ↔ AR)

| EN | AR |
|---|---|
| Patient | مريض |
| Appointment | موعد |
| Doctor | طبيب |
| Invoice | فاتورة |
| Payment | دفعة |
| Prescription | وصفة طبية |
| Laboratory | معمل |
| Radiology | أشعة |
| Pharmacy | صيدلية |
| Insurance claim | مطالبة تأمين |
| ETA e-invoice | فاتورة إلكترونية (ETA) |
| Dashboard | لوحة المعلومات |
| Reports | التقارير |
| Settings | الإعدادات |
| Log out | تسجيل الخروج |

## 6. Right-to-Left (RTL) Content

- Arabic text renders `dir="rtl"`; numbers and medical codes (ICD-10, NID, phone) stay LTR with `dir="ltr"` isolation.
- Icons that imply direction (arrows, chevrons) flip in RTL.
- Avoid directional words in copy ("click the button on the right").

## 7. Review Process

- New/changed copy → add keys to both locales in the same PR.
- Arabic medical terms reviewed by a native-speaking clinician before release.
- Keep glossary in sync when new domain terms are introduced.

---

*Related: [Accessibility](ACCESSIBILITY.md) · [Styleguide](../engineering/STYLEGUIDE.md)*
