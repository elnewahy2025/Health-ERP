# Accessibility — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Target WCAG 2.1 AA | **Review cadence:** per UI milestone

---

## 1. Standard

WCAG 2.1 Level AA for the staff and patient-facing web app, including RTL/Arabic content.

## 2. Color & Contrast

- Text contrast ≥ 4.5:1 (AA) for normal text; ≥ 3:1 for large text/UI components.
- Status never conveyed by color alone: badges include icons/labels; charts include patterns/legends.
- Focus indicator: visible 2px ring in primary color on all interactive elements.
- RTL: color-agnostic directional affordances (no "right = good" assumptions).

## 3. Keyboard

- All functionality operable by keyboard: nav via sidebar links, modals trap focus (Esc closes), tables sortable, dropdowns openable.
- Logical tab order follows visual layout in both LTR and RTL.
- Skip-to-content link at top of app shell.

## 4. Forms

- Every input has a visible `<label>` (or `aria-label` where label hidden).
- Errors: `aria-invalid`, `aria-describedby` pointing to error message; error persists until fixed.
- Autocomplete attributes for auth forms (`email`, `current-password`, `new-password`).
- Required fields marked visibly + programmatically.

## 5. Semantic Structure

- Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`; single `h1` per page.
- Tables: `caption` or `aria-label`; `scope="col/row"` on headers.
- Modals/dialogs: role `dialog`, `aria-modal`, labelled by title.
- Live regions for toasts/notifications (`role="status"` / `aria-live="polite"`); errors `assertive` where blocking.

## 6. Motion & Time

- No content flashes more than 3×/second.
- Reduced motion respected (`prefers-reduced-motion`) — disable decorative animations.
- No hard time limits on forms; session expiry warns before logout (refresh flow).

## 7. Media & Images

- Decorative icons `aria-hidden="true"`; action icons have accessible text labels.
- PDF exports include text layer (pdfmake) — not image-only.
- Charts provide data tables or summaries alongside visualizations.

## 8. RTL & Localization Accessibility

- `dir` and `lang` set correctly per locale (`lang="ar"`, `dir="rtl"`).
- Mixed content (numbers, ICD codes) isolated with `dir="ltr"`.
- Screen-reader announcements use the active locale.

## 9. Testing

- Automated: axe-core checks in e2e suite (planned for the 3→8 spec expansion).
- Manual: keyboard-only pass per milestone; screen-reader spot checks (NVDA/VoiceOver) for auth, patient detail, and portal.
- Contrast review for new tokens via DESIGN-SYSTEM.md color tokens.

---

*Related: [UX specification](UX-SPECIFICATION.md) · [Design system](DESIGN-SYSTEM.md)*
