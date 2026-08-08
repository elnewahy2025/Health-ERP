# Module Doc: auth

**Location:** `packages/backend/src/modules/auth/` · **Registration:** `registerAuthModule(app)` · **Pattern:** Clean Architecture (7 files)

---

## Purpose
Tenant registration, authentication, session management, MFA/TOTP, OTP, and password lifecycle.

## Responsibilities
- Register tenants + admin users
- Login/logout with lockout protection
- Issue + rotate refresh tokens (HttpOnly cookie)
- MFA (TOTP) setup/verify/enable/disable; OTP send/verify
- Session listing/revocation; concurrent-session enforcement
- Password reset/change; email verification

## Functional Requirements
- `POST /tenants` creates tenant + admin (rate-limited)
- `POST /auth/login` validates credentials; enforces lockout; returns access token + sets refresh cookie
- `POST /auth/refresh` rotates refresh token (reuse detection)
- `POST /auth/logout` revokes session
- `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`
- MFA/OTP flows per auth.routes.ts (18 endpoints)

## Non-Functional Requirements
- Rate limits on login/register/forgot/refresh
- Access token TTL 15 min; refresh 7 days (configurable)
- Lockout after `MAX_LOGIN_ATTEMPTS` (5)
- Max concurrent sessions enforced

## Business Rules
- `JWT_SECRET` ≠ `JWT_REFRESH_SECRET`
- Refresh tokens stored hashed; rotated per use; reuse → invalidate session
- Password must satisfy `isStrongPassword`
- MFA required when tenant policy enables it

## Database Entities
`tenants`, `users`, `roles`, `refresh_tokens`, `user_sessions`, `login_attempts`, `password_resets`, `otp_codes`.

## API Endpoints
See API-SPECIFICATION.md §4 (18 verified endpoints under `/api/v1/tenants` + `/api/v1/auth`).

## User Permissions
- Public: register, login, forgot/reset, MFA verify, refresh
- Authenticated: me, sessions, change-password, MFA setup/enable/disable, OTP
- Admin: tenant management

## Dependencies
`@healthcare/shared` (crypto, validators, errors, config), `services/otp.ts`, `services/totp.ts`, `services/refresh-token.ts`, `services/email.ts`.

## Internal Architecture
`auth.types.ts → auth.schema.ts → auth.repository.ts → auth.service.ts → auth.controller.ts → auth.routes.ts → index.ts`.

## Data Flow
Login → rate-limit check → bcrypt verify → lockout check → create session + refresh token → issue JWT → set cookie → return user + token. Refresh → verify rotation → issue new pair.

## Validation Rules
Zod schemas: email format, password strength, NID/phone when applicable; OTP length/digits.

## Error Handling
`UnauthorizedError` (bad credentials), `ForbiddenError` (locked/expired), `ConflictError` (email exists), `ValidationError` (schema).

## Security Considerations
- bcrypt hashing; rate limiting; lockout; MFA; refresh rotation + reuse detection
- HttpOnly, Secure, SameSite=Strict cookie; CSRF secret for state changes
- Redacted logs (no passwords/tokens)

## Logging & Monitoring
pino auth events (login success/failure, lockout, refresh); audit `auth:*` actions; system alerts on brute-force patterns.

## Test Strategy
`src/modules/__tests__/auth.test.ts`, `services/__tests__/totp.test.ts` — lockout, rotation, MFA, validators.

## Future Improvements
- WebAuthn/passkeys; SSO (SAML/OIDC); device fingerprinting; adaptive lockout.

---

*Related: [Security](../engineering/SECURITY.md) · [API spec](../engineering/API-SPECIFICATION.md)*
