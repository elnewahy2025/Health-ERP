# Design System — Vision Healthcare ERP

**Version:** 2.0 | **Status:** Approved | **Implementation:** CSS custom properties in `packages/frontend/src/styles/globals.css`, Tailwind `primary` palette mapping, shared components in `packages/frontend/src/components/ui`

---

## 1. Semantic Design Tokens

Tokens are defined as CSS custom properties on `:root` (light) and `.dark` (dark).
Components consume tokens through the utility classes below or `var(--token)` —
never raw hex values.

| Token | Light | Dark |
|---|---|---|
| `--background` | `#F7F9FC` | `#0F1722` |
| `--surface` | `#FFFFFF` | `#172334` |
| `--surface-secondary` | `#F6F8FB` | `#141F2D` |
| `--surface-hover` | `#F1F5F9` | `#1D2B3D` |
| `--surface-selected` | `#E8F1FB` | `#203B57` |
| `--sidebar` | `#F1F5F9` | `#0B1320` |
| `--text-primary` | `#172033` | `#F1F5F9` |
| `--text-secondary` | `#526071` | `#B7C3D0` |
| `--text-muted` | `#7A8797` | `#8290A1` |
| `--text-disabled` | `#AAB4C0` | `#596777` |
| `--border` | `#DCE3EB` | `#293849` |
| `--border-strong` | `#C8D2DE` | `#3A4B5D` |
| `--primary` | `#1769AA` | `#4EA1D8` |
| `--primary-hover` | `#125A91` | `#69B1E2` |
| `--primary-soft` | `#E8F1FB` | `#19344A` |
| `--link` | `#1769AA` | `#5DB0E8` |
| `--success` / `--success-soft` | `#16835B` / `#E8F6F0` | `#35B879` / `#143B2D` |
| `--warning` / `--warning-soft` | `#B77900` / `#FFF6DF` | `#E0A83E` / `#3A2E16` |
| `--error` / `--error-soft` | `#C83B4A` / `#FDECEF` | `#F06A78` / `#3E2027` |
| `--info` / `--info-soft` | `#2878B5` / `#EAF4FB` | `#55A7D8` / `#173347` |

### Token-backed utilities (`@layer components`)
- `.surface`, `.surface-secondary`, `.surface-hover`, `.surface-selected`
- `.text-ink`, `.text-secondary-txt`, `.text-muted-txt`
- `.border-line`, `.border-line-strong`
- `.card`, `.input`, `.label`, `.btn-*`, `.badge-*`, `.table-container`, `table/thead/tbody/td`, `.sidebar-link-*`, `.modal-*`, `.page-title`, `.stat-*`

### Tailwind `primary` palette
The `primary` scale is mapped to `rgb(var(--primary-*) / <alpha-value>)` in
`tailwind.config.js`, so every `bg-primary-*`, `text-primary-*`, and
`dark:bg-primary-*` utility switches with the theme automatically.

---

## 2. Typography
- English: **Inter** — Arabic: **IBM Plex Sans Arabic** (fallback Noto Sans Arabic).
- Page title 24px/650 · Section 18px/600 · Card 15–16px/600 · Body 14px/400 · Secondary 13px/400 · Table 13–14px · Metadata 12px.
- RTL: `html[dir="rtl"]` switches to the Arabic family; layout adapts via `rtl.css`.

## 3. Status Colors
- Green: completed, active, available, paid.
- Amber: pending, waiting, attention required.
- Red: cancelled, critical, failed, overdue.
- Blue: information, scheduled, in progress.
- Gray: inactive, archived, unavailable.
- Always pair color with a readable label — never color alone.

## 4. Shape & Elevation
- Radius: inputs/buttons 6px, cards 8px, dialogs 10px, badges full.
- Light cards: `0 1px 3px rgba(15, 23, 42, 0.06)`. Dark mode uses surface contrast + borders, no heavy shadows.
- Modal overlay: `rgba(15, 23, 42, 0.45)` light / `rgba(0, 0, 0, 0.60)` dark.

## 5. Theme Switching
- `ThemeProvider` (`stores/themeStore.tsx`) supports **light**, **dark**, and **system**.
- The selection persists in `localStorage['theme']`; `index.html` applies the class before first paint to prevent flash.
- Tailwind `darkMode: 'class'` — `.dark` on `<html>`.

## 6. Component Inventory
`Button`, `Input`, `Select`, `Modal`, `Table`, `Badge`, `Card`, `EmptyState`, `Spinner`, `PageLoader`, `FileUpload`, `FormField`, `PatientSearchField`, `ImageViewer`, `ErrorBoundary`, `confirmDialog`, layout shell (`Sidebar`, `Header`, `QuickSearch`).

## 7. Component Contracts
- All shared components consume semantic tokens (see §1).
- Forms: visible focus ring using the primary token; labels use `--text-secondary`.
- Tables: header `--surface-secondary`, body `--surface`, hover `--surface-hover`, row borders `--border`.
- Navigation: sidebar background `--sidebar`; active item `--surface-selected` + primary text; inactive `--text-secondary` with hover state.
