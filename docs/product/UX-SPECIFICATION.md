# UX Specification — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Design Principles

1. **Speed for staff** — reception, clinicians, and pharmacists complete tasks in fewest clicks.
2. **Clarity over density** — tables, badges, and empty states communicate status at a glance.
3. **Bilingual by default** — EN/AR parity with automatic RTL.
4. **Trust** — every destructive action confirms; errors are actionable; data is never silently lost.
5. **Mobile-responsive** — the app degrades gracefully to mobile browsers (queue display, kiosk, portal).

## 2. Information Architecture

```text
Login / Register / Forgot / Reset          (auth shell)
  └─ App shell (sidebar + topbar)          (layout)
       ├─ Dashboard                         (role-aware widgets)
       ├─ Patients     → Detail → Timeline / EMR / Billing
       ├─ Appointments → Calendar + Queue
       ├─ Clinical     → EMR, Lab, Radiology, Pharmacy, Nursing, Home Visits
       ├─ Finance      → Billing, Expenses, Budgets, ETA, Insurance Claims
       ├─ Operations   → Inventory, HR, Regions/Branches, DMS
       ├─ Platform     → Reports, BI, Automation, Workflow, Integrations, Settings
       └─ Admin/SaaS   → Subscriptions, White-label, System Monitor, Audit Logs
```

## 3. Key User Flows

### 3.1 Patient Check-In (Receptionist)
1. Search patient (type-ahead, pg_trgm).
2. Open patient → Book appointment (date/time, doctor, branch).
3. Queue entry auto-created; reminder scheduled.
4. Patient checks in via kiosk or reception → status `checked_in` → queue display updates.

### 3.2 Clinical Encounter (Physician)
1. Open appointment from today list.
2. Record vitals + notes (AI-assisted drafting available).
3. Add diagnoses (ICD-10 search) + procedures + prescriptions.
4. Order lab/radiology/nursing tasks as needed.
5. Save → EMR record + audit trail.

### 3.3 Billing (Accountant)
1. Select patient → open invoice.
2. Add line items (catalog, EGP formatting).
3. Apply insurance coverage if policy exists.
4. Submit to ETA (QR) and/or collect payment (cash/Fawry/InstaPay).
5. Print receipt (print templates / PDF).

### 3.4 Patient Self-Service (Portal)
1. Login/register with OTP or password.
2. Book/reschedule via online booking slots.
3. View records shared by clinic; message care team; complete surveys.

## 4. Layout & Navigation

- **Sidebar** groups modules by domain (icons + labels, i18n).
- **Topbar** shows branch switcher, notifications bell, user menu (sessions, security, preferences, logout).
- **Breadcrumbs** for nested pages (Patient → Detail → Timeline).
- **RTL:** when locale = ar, layout mirrors automatically (dir=rtl).
- **State indicators:** badges for statuses (pending/confirmed/checked-in/completed/cancelled), toasts for async results.

## 5. Interaction Patterns

| Pattern | Spec |
|---|---|
| Forms | react-hook-form + zod; inline field errors; submit disabled while pending |
| Tables | sortable columns, pagination, row actions menu, search |
| Modals | confirm destructive actions; escape/backdrop close; focus trap |
| Empty states | icon + title + primary action |
| Loading | skeleton rows (tables), spinners (buttons) |
| Errors | toast with retry; inline validation messages; 4xx message surfaces from API envelope |
| Notifications | bell with unread count; toast for real-time events |

## 6. States & Feedback

- Success: green toast + list/table refresh via React Query invalidation.
- Error: red toast with actionable message; form fields flagged.
- Pending: disabled controls, loading indicators; no double-submit.
- Offline: explicit error state; retry button (React Query refetch).

## 7. Responsive & Breakpoints

| Breakpoint | Behavior |
|---|---|
| < 640 px | Stacked layouts, drawer navigation, condensed tables |
| 640–1024 px | Two-column grids, collapsible sidebar |
| > 1024 px | Full sidebar + content, multi-column forms |

## 8. Accessibility in UX

- Minimum 44×44 px touch targets for primary actions.
- Color is never the only status indicator (icons + text + badges).
- Focus visible on keyboard navigation; logical tab order (see ACCESSIBILITY.md).

---

*Related: [Design system](DESIGN-SYSTEM.md) · [Accessibility](ACCESSIBILITY.md) · [Content guidelines](CONTENT-GUIDELINES.md)*
