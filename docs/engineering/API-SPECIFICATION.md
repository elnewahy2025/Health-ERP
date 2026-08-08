# API Specification — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Base path:** `/api/v1`

---

## 1. Conventions

- **Base URL:** `http://localhost:3000/api/v1` (dev) — production behind Nginx.
- **Format:** JSON (`application/json`); multipart for uploads.
- **Versioning:** URI prefix `/api/v1`; breaking changes → `/api/v2` (VERSIONING.md).
- **Auth:** `Authorization: Bearer <access_token>` for protected endpoints; refresh via HttpOnly cookie.
- **Response envelope (success):**
  ```json
  { "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 154 } }
  ```
- **Error envelope:**
  ```json
  { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": [{ "field": "email", "message": "Required" }] } }
  ```
- **Error codes:** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `RATE_LIMITED`, `TENANT_NOT_FOUND`, `INTERNAL_ERROR`.
- **Pagination:** query params `page` (1-based), `pageSize` (default 20, max 100).
- **OpenAPI:** Swagger UI at `/docs` in dev (`@fastify/swagger` + `swagger-ui`).

## 2. Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No content (delete) |
| 400 | Validation error |
| 401 | Unauthenticated |
| 403 | Forbidden (RBAC) |
| 404 | Not found |
| 409 | Conflict |
| 429 | Rate limited |
| 500 | Internal error |

## 3. Rate Limits

| Endpoint group | Limit | Implementation |
|---|---|---|
| `POST /auth/login` | 10/min/IP | `loginRateLimit` |
| `POST /tenants` | 5/min/IP | `registerRateLimit` |
| `POST /auth/forgot-password`, `resend-verification` | 5/min/IP | `forgotPasswordRateLimit` |
| `POST /auth/refresh` | 20/min/IP | `refreshRateLimit` |
| Global API | 100/min/IP (configurable) | `@fastify/rate-limit` |

## 4. Authentication Endpoints (verified from `auth.routes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/tenants` | Public (rate-limited) | Register tenant + admin |
| POST | `/auth/login` | Public | Login, returns tokens + sets cookie |
| POST | `/auth/mfa/verify` | Public | Verify MFA challenge |
| POST | `/auth/refresh` | Cookie | Rotate refresh token |
| POST | `/auth/logout` | Bearer | Invalidate session |
| GET | `/auth/me` | Bearer | Current user profile |
| GET | `/auth/sessions` | Bearer | List sessions |
| DELETE | `/auth/sessions/:sessionId` | Bearer | Revoke session |
| POST | `/auth/forgot-password` | Public (rate-limited) | Send reset email |
| POST | `/auth/reset-password` | Public | Reset with token |
| POST | `/auth/change-password` | Bearer | Change own password |
| POST | `/auth/verify-email` | Bearer | Verify email with code |
| POST | `/auth/resend-verification` | Public (rate-limited) | Resend code |
| POST | `/auth/mfa/setup` | Bearer | Start TOTP setup |
| POST | `/auth/mfa/enable` | Bearer | Enable TOTP |
| POST | `/auth/mfa/disable` | Bearer | Disable TOTP |
| POST | `/auth/otp/send` | Bearer | Send OTP |
| POST | `/auth/otp/verify` | Bearer | Verify OTP |

### Example — Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "admin@clinic.example", "password": "S3cure!Pass" }
```
```json
{ "success": true, "data": { "user": { "id": "uuid", "email": "admin@clinic.example", "role": "admin" }, "accessToken": "eyJ..." } }
```
Set-Cookie: `refreshToken=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`

## 5. Resource Endpoint Families

| Module | Base path | Representative endpoints |
|---|---|---|
| Patients | `/api/v1/patients` | CRUD, search, timeline, allergies, medications |
| Appointments | `/api/v1/appointments` | CRUD, reschedule, cancel, reminders, availability |
| EMR | `/api/v1/emr` | Encounters, vitals, diagnoses, procedures, orders |
| Billing | `/api/v1/billing` | Invoices, payments, refunds, ETA submit |
| Inventory | `/api/v1/inventory` | Items, warehouses, stock, purchase orders |
| Pharmacy | `/api/v1/pharmacy` | Prescriptions, dispensing, stock |
| Laboratory | `/api/v1/laboratory` | Catalog, orders, results |
| Radiology | `/api/v1/radiology` | Orders, imaging results |
| Queue | `/api/v1/queue` | Entries, display settings, kiosk check-in |
| HR | `/api/v1/hr` | Employees, attendance, leave, payroll |
| CRM | `/api/v1/crm` | Campaigns, feedback |
| Notifications | `/api/v1/notifications` | Templates, preferences, logs, dispatch |
| Reports | `/api/v1/reports` | Definitions, executions, schedules |
| BI | `/api/v1/bi` | Dashboards, widgets, analytics data |
| Compliance | `/api/v1/compliance` | Policies, audits, reports |
| Integrations | `/api/v1/integrations` | Webhooks, API keys, connections |
| SaaS | `/api/v1/saas` | Subscriptions, plans, usage |
| White-label | `/api/v1/white-label` | Branding, domains |
| DMS | `/api/v1/dms` | Documents, versions, shared documents |
| AI | `/api/v1/ai` | Clinical notes, suggestions, predictions, cost logs |
| Workflow/Automation | `/api/v1/workflow`, `/api/v1/automation` | Definitions, instances, rules |
| System | `/api/v1/system` | Health, monitor, metrics, alerts |
| Data | `/api/v1/data` | Export jobs, import jobs, bulk import |
| Regions/Multi-branch | `/api/v1/regions`, `/api/v1/branches` | Org structure |
| Referrals/Home visits | `/api/v1/referrals`, `/api/v1/home-visits` | Care coordination |
| Patient portal/booking | `/api/v1/patient-portal`, `/api/v1/online-booking` | Self-service |
| Print templates | `/api/v1/print-templates` | PDF generation |

## 6. Validation Rules

- Zod schemas at route boundary (`*.schema.ts`); invalid input → 400 with field details.
- Email: format + normalized lowercase.
- Password: ≥ 8 chars, mixed case + digit + symbol (shared `isStrongPassword`).
- Egyptian NID: 14 digits with checksum + embedded governorate/birthdate/gender validation.
- Phone: Egyptian prefixes 010/011/012/015 + international format.
- Webhook URLs: must be HTTPS and validated (`validateWebhookUrl`) — SSRF protection.
- Pagination: `page >= 1`, `pageSize` 1–100.

## 7. Error Responses (examples)

```json
// 401
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Token expired" } }
// 403
{ "success": false, "error": { "code": "FORBIDDEN", "message": "Missing permission: billing:create" } }
// 429
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many attempts, try again later" } }
```

## 8. WebSocket Channels

| Channel | Purpose |
|---|---|
| `/ws/chat` | Chat conversations |
| `/ws/queue` | Real-time queue display |
| `/ws/telemedicine` | Waiting room + session presence |
| `/ws/voice` | Voice call signaling |

Auth via access token (query param or first message); unauthorized connections dropped.

## 9. Versioning Strategy

- Path versioning (`/api/v1`) — new major → new path; old path maintained for one deprecation cycle.
- Non-breaking additions (new fields/endpoints) never bump major.
- Deprecation header `Deprecation: true` + `Sunset` date on old versions.

---

*Related: [Technical specification](../core/TECHNICAL-SPECIFICATION.md) · [Security](SECURITY.md)*
