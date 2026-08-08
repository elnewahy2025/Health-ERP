# Design System — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Implementation:** `packages/frontend/src/components/ui`, TailwindCSS

---

## 1. Tokens

### Color
| Token | Usage |
|---|---|
| `primary` (brand blue) | actions, active nav, links |
| `secondary` | secondary actions |
| `success` | confirmed/completed states |
| `warning` | pending/warning states |
| `danger` | destructive, errors, critical |
| `neutral` scale | text, borders, surfaces |
| Semantic text/backgrounds follow Tailwind theme; contrast meets WCAG AA (see ACCESSIBILITY.md) |

### Typography
| Token | Value |
|---|---|
| Font family | system stack (inter/roboto fallback) |
| Size scale | 12/14/16/18/20/24/30 px |
| Line height | 1.5 body; 1.25 headings |
| Arabic | same scale; RTL-aware alignment |

### Spacing & Radius
- Spacing scale: 4px base (4/8/12/16/24/32).
- Radius: 6px default controls, 8px cards, full for badges/avatars.
- Shadows: subtle elevation for cards/modals; focus ring 2px primary.

## 2. Component Inventory (`components/ui`)

`Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch`, `Modal`, `Dialog`,
`Table`, `Badge`, `Avatar`, `Card`, `Tabs`, `Tooltip`, `Dropdown`, `DatePicker`, `TimePicker`,
`SearchInput`, `Pagination`, `EmptyState`, `Spinner`, `Toast`, `Alert`, `Breadcrumbs`,
`Tabs`, `Accordion`, `Drawer` (mobile nav), `StatCard`, `ChartCard`.

## 3. Component Contracts

| Component | Props contract (subset) | Notes |
|---|---|---|
| `Button` | `variant: primary\|secondary\|danger\|ghost`, `size`, `loading`, `disabled`, `icon` | loading disables + spinner |
| `Input` | `label`, `error`, `hint`, `prefixIcon`, `type`, `dir` | error → red border + message |
| `Modal` | `open`, `onClose`, `title`, `size`, `footer` | focus trap, esc close, backdrop |
| `Table` | `columns[]`, `data`, `loading`, `onRowClick`, `pagination` | skeleton while loading |
| `Badge` | `tone: success\|warning\|danger\|info\|neutral` | statuses |
| `Select` | `options[]`, `value`, `onChange`, `error` | native select, styled |
| `DatePicker`/`TimePicker` | `value`, `onChange`, `min`, `max` | locale-aware |

## 4. Layout Components

- `AppLayout`: sidebar + topbar + content outlet; responsive drawer on mobile.
- `PageHeader`: title + subtitle + actions.
- `StatCard`: metric + delta + icon (dashboards/BI).
- `ChartCard`: recharts wrapper with legend and tooltip.

## 5. Theming & White-Label

- Tailwind theme driven by CSS variables at `:root`; tenant branding overrides via
  `white-label` module (`tenant_branding`) — primary color, logo, favicon, name.
- Dark mode: not in v1 scope (documented assumption); variables structured to allow it later.

## 6. Iconography

- `lucide-react` icons; stroke 2; 16–24px; aria-hidden with text labels for actions.

## 7. Usage Rules

- Build new UI from existing primitives; only add a primitive when 3+ usages justify it.
- Keep components controlled; state via React Query/hooks, not component internals.
- Every primitive used in pages must be covered by the `ui` barrel export.

---

*Related: [UX specification](UX-SPECIFICATION.md) · [Styleguide](../engineering/STYLEGUIDE.md) · [Accessibility](ACCESSIBILITY.md)*
