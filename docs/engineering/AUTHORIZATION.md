# Authorization, RBAC & User Management — Implementation Reference

**Status:** Implemented (Phases 1–8) — Phase 9 test suite in progress. **Owner:** Engineering.

> **Implementation log (2026-08-09):**
> - Phases 1–2 done: shared catalog (`@healthcare/shared/authz`, 64 modules), migration
>   `033_authorization_rbac` (+ `034_emergency_access`), centralized service
>   (`services/authorization.ts`) wired into `authenticate`.
> - Phase 3 done: permission guards + scope enforcement across all backend modules
>   (patients, appointments, EMR, billing, laboratory, radiology, pharmacy, queue, nursing,
>   insurance, DMS, HR, inventory, and every platform/developer module). Chat WebSocket +
>   REST hardened: membership + tenant verified on join, history, send, read, participants,
>   and online list; patient principals supported via `chat_participants.principal_kind`.
> - Phase 4 done: `/api/v1/users` CRUD (list/search/filter, create, update, status
>   activate/deactivate/suspend, admin password reset, forced logout, per-user audit) and
>   `/api/v1/rbac/roles` custom-role CRUD with escalation cap, `perm_version` bump, and
>   session revocation on every grant change. `departments` module added to the catalog and
>   API (per-tenant department dictionary).
> - Phase 5 done: `can()`/`canAny()` in `authStore`, sidebar filtered by permission,
>   `ProtectedRoute` blocks direct URL access, Users + Roles admin pages
>   (`/admin/users`, `/admin/roles`) with a module × action × scope matrix editor.
> - Phase 6 (patient self-scope) verified: portal derives the patient from the session
>   token only — no client-supplied patientId is ever trusted.
> - Phase 7 chat hardening done (see Phase 3 note).
> - Phase 8 done: `emergency_access` table + module (`/api/v1/emergency-access/*`):
>   reason required, 60-minute window, auto-expiry, audited with `emergency: true`,
>   revocable, enforced via `hasEmergencyAccess` in `canAccessPatient`.
> - Frontend mirror map: `packages/frontend/src/router/index.tsx` → `routePermissions`.
>   Backend remains authoritative.

> **How to use this document:** This is the single source of truth for the User Management, RBAC, and
> Authorization system. Read it in full before starting implementation, and consult it before every
> phase and whenever a decision is needed. If a decision changes during implementation, update this
> document in the same change. Do not implement authorization logic that contradicts it.

---

## 1. Purpose

Implement an enterprise-grade, multi-tenant **User Management + RBAC + Authorization** system for the
Vision Healthcare ERP. Every authorization decision combines **what** a user may do (permission) with
**where** they may do it (scope). Roles are only a packaging mechanism for permission grants — they are
never the source of truth by themselves.

Core model:

```
User (or Patient principal) → Roles → Permission Grants (module.action + scope) → Scope Resolution
```

---

## 2. Non-negotiable principles

1. **Server-side is the source of truth.** Frontend hiding is a UX mirror only.
2. **Never trust the client.** No client-provided tenantId, branchId, userId, patientId, role, or
   permission. Derive everything from the authenticated principal and server-side relationships.
3. **Least privilege by default.** New users start with no grants. "All branches"/tenant-wide/system
   access are explicit grants, never defaults.
4. **No hardcoded role checks** (`if (role === 'admin')`) anywhere. One centralized authorization layer.
5. **Every layer enforces**: REST APIs, WebSockets, background jobs, file access, exports, prints,
   database queries.
6. **No privilege escalation.** A user cannot grant permissions they do not hold (unless explicitly
   authorized via a manage permission).
7. **Every sensitive action is audited.** Audit logs are append-only and not editable by ordinary users.
8. **Do not weaken existing security controls** (CSRF, refresh-token rotation, lockout, MFA, RLS) to
   make features work.
9. **Reuse existing patterns** — do not create parallel or duplicate systems.

---

## 3. Current-state audit (what exists vs. gaps)

### 3.1 Exists (reuse, don't rebuild)

| Area | Existing code |
|---|---|
| Tenants | `tenants` table, `tenant_id` FK on all domain tables, `req.ctx.tenantId` |
| Branches | `branches` table; `users.branch_id` (single) |
| Users | `users` table: email, phone, password_hash, names, `role_id`, `roles` jsonb, `permissions` jsonb, `status`, MFA fields, `branch_id`, `last_login_at`, `password_changed_at`, `failed_login_attempts`, `locked_until` |
| Auth | `modules/auth` — login, MFA/TOTP, OTP, lockout, password reset, refresh-token rotation + family reuse detection, CSRF (`index.ts`) |
| Sessions | `user_sessions`, `session-manager` module (list/revoke/security-info), `MAX_CONCURRENT_SESSIONS` |
| Audit | `services/audit.ts` (`logAudit`), audit-logs APIs |
| RBAC skeleton | `roles` table (permissions jsonb, `is_system`), `requirePermission()` guard, static role templates in `modules/rbac/index.ts` |
| Staff | `employees` table (`department`, `position`, `employment_type`, nullable `user_id`) |
| Patient portal | `portal_sessions` OTP flow, patient-scoped dashboard endpoints |
| Chat | `chat_conversations/chat_participants/chat_messages`, WebSocket endpoint in `services/chat.ts` |
| Frontend auth | `stores/authStore.tsx` (roles/permissions from `/auth/me`), `appRoutes.requiredPermission` (defined, unused) |
| Patient RLS | RLS enabled on `patients` (migrations 023/027) |

### 3.2 Gaps (must be built)

1. **RBAC is inert.** Access tokens carry only `{tenantId, userId}` (`modules/auth/auth.service.ts`
   `buildAccessTokenPayload`), but `authenticate` reads roles/permissions from the token claims where
   they never exist. `requirePermission()` can never pass and `super_admin` is undetectable. Only 4
   call sites exist out of ~466 authenticated endpoints.
2. **No user-management module.** No `/api/v1/users` CRUD, no Roles/Permissions management UI.
3. **No branch enforcement.** `ctx.branchId` is never populated; no queries filter by branch; users
   have a single `branch_id`.
4. **Patients are not principals.** Portal uses separate opaque `portal_sessions`; chat participants
   reference `users` only, so patients cannot join the unified authz/audit/chat model.
5. **Chat is open.** WS joins any `conversationId` with any valid JWT — no membership, tenant, or
   patient check; history is served unchecked.
6. **Frontend shows everything.** `Sidebar.tsx` renders all modules; route guard checks auth only.

---

## 4. Agreed decisions (ADRs)

| # | Decision | Detail |
|---|---|---|
| D1 | **Unified principal** | Identity = `{ kind: 'user' \| 'patient', id, tenantId }`. Staff = `users` rows (email/password + MFA). Patients = portal principals via OTP (no password accounts); role `patient`, scope `self`. |
| D2 | **Least-privilege branches** | New users have no grants. Admin explicitly assigns role(s) + branch(es). Users see only assigned branches by default. "All branches" = explicit `branches` scope grant. Multi-branch assignment is supported (`user_branches`). |
| D3 | **Permission model** | Grants are `(module.action, scope)` pairs. Action set: `view, create, edit, delete, approve, reject, export, print, download, manage, assign, cancel`. Legacy actions (`read, update, import`) map onto this set. |
| D4 | **Scopes** | `self`, `assigned_patients`, `department`, `branch`, `branches`, `tenant`, `system`. `system` only for `super_admin`-type principals. |
| D5 | **Role levels** | `system` (seeded, immutable: `super_admin`, `admin`), `tenant`, `branch`, `custom`. Multiple roles per user. |
| D6 | **Escalation cap** | An admin may assign only grants they themselves hold, or grants under modules where they hold `<module>.manage`/`assign`. |
| D7 | **Departments** | Attribute + per-tenant dictionary (`departments` table), matching current `employees.department` usage. Not a full hierarchy entity. |
| D8 | **Effective permissions** | Computed server-side per request from DB (roles → grants, direct grants). JWT stays minimal; `users.perm_version` bumped on any grant change; affected sessions revoked. |
| D9 | **Files/exports/prints** | All go through the authz layer; downloads use short-lived signed URLs issued only after `module.download`/`export`/`print` authorization. No guessable file URLs. |
| D10 | **Break-glass** | Explicit `emergency_access` permission (default: no one has it). Activation requires a reason; auto-audited with `emergency=true`, tenant/branch/timestamp/principal/resources; limited duration; notifies admins. |
| D11 | **Patients in chat** | Chat participants support both principal kinds (`kind: user\|patient`, `patient_id` nullable alongside `user_id`). |
| D12 | **Departments/dictionary tables** | `departments`, `user_branches`, `user_roles`, `role_permissions` are new normalized tables; existing jsonb data is backfilled and legacy columns deprecated (not removed) during transition. |

---

## 5. Permission catalog & authorization matrix (source of truth)

### 5.1 Actions

`view, create, edit, delete, approve, reject, export, print, download, manage, assign, cancel`

### 5.2 Scopes

`self, assigned_patients, department, branch, branches, tenant, system`

### 5.3 Modules × actions × scopes

| Module | Actions available | Default scopes |
|---|---|---|
| `patients` | view, create, edit, delete, approve, export, manage | assigned_patients, department, branch, branches, tenant |
| `appointments` | view, create, edit, delete, cancel, approve, export, manage | assigned_patients, department, branch, branches, tenant |
| `emr` | view, create, edit, sign(approve), export, print, manage | assigned_patients, department, branch, tenant |
| `queue` | view, update, manage | branch, branches, tenant |
| `referrals`, `nursing`, `home_visits`, `telemedicine` | view, create, edit, update, manage | assigned_patients, department, branch, tenant |
| `laboratory`, `radiology` | view, create, edit, approve, reject, print, export, manage | department, branch, tenant |
| `pharmacy` | view, create, edit, approve, reject, print, export, manage | branch, branches, tenant |
| `billing`, `insurance`, `insurance_claims`, `eta_invoicing` | view, create, edit, delete, approve, reject, cancel, export, print, manage | branch, branches, tenant |
| `inventory`, `expenses` | view, create, edit, delete, export, manage | branch, branches, tenant |
| `hr` | view, create, edit, delete, export, manage | tenant, system |
| `crm`, `dms`, `workflow`, `forms`, `compliance`, `automation`, `integrations` | view, create, edit, delete, export, manage | branch, branches, tenant |
| `bi`, `reports`, `financial_reports`, `compliance_reports`, `advanced_reporting`, `analytics_dashboard` | view, export, print, manage | branch, branches, tenant |
| `ai_hub`, `clinical_ai`, `predictive_analytics`, `smart_scheduling` | view, create, manage | department, branch, tenant |
| `notifications`, `communications`, `whatsapp`, `voice_calls`, `patient_messages`, `chat` | view, create, edit, delete, manage | assigned_patients, branch, branches, tenant |
| `patient_portal`, `online_booking`, `patient_self_service` | view, manage | self, branch, tenant |
| `users`, `roles` | view, create, edit, delete, assign, manage | branch, tenant, system |
| `audit` | view, export, manage | tenant, system |
| `sessions`, `system_monitor`, `settings`, `branches`, `regions`, `saas_billing`, `white_label`, `dr_backup`, `barcodes`, `data_warehouse`, `api_keys`, `developer_portal`, `data_export`, `bulk_import` | view, create, edit, delete, export, manage | tenant, system |
| `documents` | view, create, edit, delete, download, print, manage | assigned_patients, department, branch, tenant |
| `emergency_access` | manage (break-glass) | tenant, system |
| `departments` | view, create, edit, delete, manage | tenant |

> The exact catalog lives as shared constants (`module.action` keys). Every module added later
> registers its keys in the catalog and the matrix above is updated in the same PR.

### 5.4 Seed roles (example grants — matrix drives tests)

| Role | Level | Example grants |
|---|---|---|
| `super_admin` | system | `*.*` scope `system` |
| `admin` | system (seed per tenant) | **every** catalog module view/create/edit/delete/manage scope `tenant` (never `system` — cannot cross tenants) |
| `doctor` | tenant | `patients.view/edit` scope `assigned_patients`; `emr.*` scope `assigned_patients`; `appointments.view/update`; `laboratory.view/print`; `radiology.view`; `pharmacy.view`; `billing.view`; `insurance.view`; `chat.view/create` scope `assigned_patients` |
| `nurse` | tenant | `patients.view/edit` scope `department`; `emr.view/create` scope `department`; `nursing.*` scope `department`; `queue.view/update` scope `branch` |
| `receptionist` | tenant | `patients.view/create/edit` scope `branch`; `appointments.*` scope `branch`; `billing.view/create` scope `branch`; `queue.*` scope `branch`; `insurance.view`; `communications.view/create` |
| `pharmacist` | tenant | `pharmacy.*` scope `branch`; `patients.view`; `emr.view` |
| `lab_tech` | tenant | `laboratory.*` scope `department`; `patients.view`; `emr.view` |
| `radiologist` | tenant | `radiology.*` scope `department`; `patients.view`; `emr.view` |
| `billing_staff` | tenant | `billing.*` scope `branch`; `insurance.view`; `patients.view` |
| `accountant` | tenant | `billing.view/export`; `reports.view/export`; `financial_reports.view/export` |
| `manager` | tenant | `reports.*` scope `tenant`; `hr.view` scope `tenant`; branch data view |
| `patient` | system (per tenant) | own profile, appointments, emr, laboratory, radiology, documents, invoices, payments, notifications, chat — all scope `self` |

---

## 6. Enforcement architecture

### 6.1 Backend

- **`loadPrincipal(request)`** — resolves `{ kind, id, tenantId }` from the auth token (user) or portal
  session (patient); loads effective grants (roles → `role_permissions` + direct `user_permissions`),
  branch assignments, department, status. `super_admin` bypass only for `system`-scope decisions.
- **`authorize(permission, scope?)`** — Fastify preHandler guard. Fails 403 before any handler runs.
- **`scopeQuery(qb, principal, opts)`** — central Knex helper applying `tenant_id` always, plus
  branch/department/assigned-patients/self filters. Repository/service layer uses it; no scattered
  ad-hoc tenant filters for new code (existing code migrated module by module).
- **Resource checks** — `canAccessResource(principal, resource)` for patient-owned records (EMR,
  lab/radiology orders, invoices, documents, messages): patient principals may only access own data;
  staff must hold the permission with a scope covering the resource's tenant/branch/department/patient.
- **Files/exports** — issue short-lived signed URLs only after `authorize('documents.download'|'X.export'|'X.print')`.
- **Jobs** — background jobs carry an explicit principal context or re-resolve server-side.
- **WebSockets** — handshake verifies JWT/portal token, tenant, and conversation membership
  (`chat_participants` by principal kind+id) before join/history/send; every message insert re-validates.

### 6.2 Frontend

- Central `can(permission, scope?)` in the auth store + `usePermission()` hook + `<Can>` wrapper.
- Sidebar/navigation filtered from the authorization matrix; route guards block direct URL access;
  buttons/menus/context actions gated with the same `can()`.
- Server remains authoritative — all UI hiding is derived from the same shared catalog, never duplicated
  per page.

---

## 7. Data model changes (migration plan)

New/changed tables (Postgres):

- `departments` — per-tenant dictionary (`id, tenant_id, name, code, is_active`).
- `role_permissions` — `(role_id, permission, scope, tenant_id nullable)` — normalized grants.
- `user_permissions` — `(user_id, permission, scope, tenant_id, assigned_by)` — direct per-user grants.
- `user_roles` — `(user_id, role_id, tenant_id, assigned_by, created_at)`.
- `user_branches` — `(user_id, branch_id, tenant_id)`.
- `users` additions — `employee_type`, `department_id`, `position`, `professional_info` jsonb,
  `created_by`, `perm_version int default 0`. Keep legacy `roles`/`permissions`/`branch_id` during
  transition (deprecated, read only for backfill).
- `roles` additions — `level ('system'|'tenant'|'branch'|'custom')`, `scope_default`.
- `audit_logs` additions — `branch_id`, `result`, `principal_kind`.
- `chat_participants` — `user_id` nullable, add `principal_kind`, `patient_id` nullable.
- `portal_sessions` — link to the unified principal model (no behavior change to OTP flow).

Backfill: existing `users.roles` jsonb → `user_roles` + `role_permissions` from seed templates;
`users.permissions` jsonb → direct grants; `users.branch_id` → `user_branches`.
Legacy permission keys are normalized (`read→view`, `update→edit`, `import→create`, both `.` and `:`
separators) and legacy direct grants default to `tenant` scope to preserve existing access; admins
narrow them afterwards.

---

## 8. Implementation phases

| Phase | Scope | Definition of done |
|---|---|---|
| 1 | Permission catalog + schema migration + backfill | Shared catalog/matrix constants; all tables above; backfill verified; legacy data intact |
| 2 | Central authorization service | `loadPrincipal`, `authorize()` guard, `scopeQuery`, resource checks; wired into `authenticate`; super_admin + perm_version/session revocation hooks |
| 3 | Backend enforcement sweep | All ~466 authenticated endpoints declare permissions; queries scoped; portal self-scope; files/exports/prints secured; WS chat authorized |
| 4 | User & role management APIs | Users CRUD + provisioning from HR, activate/deactivate/suspend, admin password reset, forced logout, session revocation, role/permission/branch/scope assignment with escalation cap; audit on every change |
| 5 | Frontend access control + admin UI | `can()`/`usePermission`/`<Can>`; nav + route + action gating; Users page (search/filter/detail/status/sessions/audit); Roles page with module×action matrix editor |
| 6 | Patient access completion | Unified patient principal; own profile/appointments/records/diagnoses/prescriptions/lab/radiology/documents/invoices/payments/notifications; IDOR-proof |
| 7 | Secure real-time chat | Membership/tenant/patient checks on join + every message; patient participants; branch scoping for staff; read/unread + status; attachments via signed URLs; audit |
| 8 | Break-glass emergency access | **Implemented** — `emergency_access` table, `/api/v1/emergency-access/activate|revoke|active|log|patient/:patientId`, reason required (≥10 chars), 60-min window, audited with `emergency: true`, enforced in `canAccessPatient` via `hasEmergencyAccess` |
| 9 | Authorization tests + review | Positive/negative suites (cross-tenant/branch/patient, IDOR, WS, exports, escalation, break-glass); end-to-end flow review; docs updated |

---

## 9. Testing requirements

Every sensitive endpoint must have authorization tests covering at minimum:

- Valid access (right permission + right scope).
- Invalid access (missing permission, wrong scope) → 403.
- Cross-tenant access denied (manipulated IDs/query params/URLs/WS).
- Cross-branch access denied.
- Cross-patient access denied (patient A cannot read patient B via ID swap).
- IDOR/BOLA on every patient-owned resource.
- Role/permission change → immediate effect + session revocation.
- Privilege escalation attempts rejected.
- Unauthorized exports/prints/downloads denied; signed URLs expire.
- WebSocket join/history/send rejected for non-members and cross-tenant.
- Break-glass: reason required; event audited; window enforced.
- Frontend route guard blocks direct URL access (mirror only — backend tests are authoritative).

---

## 10. Open items

- None blocking. Confirm with product before changing: exact seed-role grant matrix per tenant type,
  and whether departments need hierarchy beyond a flat dictionary.

---

## 11. Patient portal access model (staff-verified OTP)

The patient portal uses a **human-in-the-loop OTP** model while automated SMS/WhatsApp sending is
not configured:

1. **Access request (always required):** the patient opens the public `/portal` page, enters org
   code, name, country code + phone, 14-digit national ID, DOB, gender (email optional). The request
   is stored in `portal_enrollment_requests` (`status = pending`), tenant-scoped, audited
   (`portal.enrollment_requested`). The national ID is encrypted at rest (`encryptField`, same key as
   `patients.national_id`).
2. **Staff approval:** receptionists with `patient_portal.view` see the pending queue
   (`GET /api/v1/portal/enrollments`, `POST /:id/approve|reject`). On approval the request is linked
   to the existing patient matching the national ID, or a minimal patient record is created
   (MRN via `generateMedicalRecordNumber`). Audited (`portal.enrollment_approved|rejected`).
3. **OTP request (every login):** `POST /api/v1/portal/otp/request` requires an approved enrollment.
   A 6-digit OTP is generated, **encrypted** at rest in `portal_sessions.otp_encrypted`
   (10-minute expiry, single-use), and enters the staff delivery queue
   (`delivery_status = pending`). Reuses an active pending OTP for the same patient.
4. **Staff delivers:** `GET /api/v1/portal/otp-queue` returns pending OTPs (decrypted for staff
   relay), patient phone, and a pre-filled `wa.me` click-to-chat link. `POST /:id/sent` marks it
   delivered. Audited (`portal.otp_requested`, `portal.otp_sent`).
5. **Verify:** `POST /api/v1/portal/verify` exchanges the OTP for a 30-day portal session token
   (token column is replaced; `delivery_status = verified`; audited `portal.otp_verified` /
   `portal.otp_failed`). All portal data endpoints (`/dashboard`, `/appointments`, `/records`,
   `/bills`, `/documents`, `/messages`) resolve the patient strictly from the session token —
   no client-supplied patient ID. Rate limits: 5 access requests/min and 3 OTP requests/min per IP.

Roles: portal endpoints are public by design; staff queue endpoints require `patient_portal.view`.
Tenant isolation: every enrollment/session row carries `tenant_id` and every query is tenant-scoped.
