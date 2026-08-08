# Configuration — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Source of truth:** `.env.example`, `packages/shared/src/config/environment.ts`

---

## 1. Configuration Model

- All runtime config flows through `@healthcare/shared/config` → `getEnv()`.
- `NODE_ENV` selects validation: `validateProductionEnvironment()` fails boot on missing required vars.
- Environment files: `.env` (app), `.env.docker` (compose); templates `.env.example`, `.env.docker.example`.
- Secrets can be provided via Docker secrets `_FILE` convention.

## 2. Variable Reference

### Server
| Var | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | development | yes | development / production / test |
| `PORT` | 3000 | yes | Backend port |
| `HOST` | 0.0.0.0 | yes | Bind address |
| `LOG_LEVEL` | info | no | pino level |
| `BASE_URL` / `APP_URL` | — | prod | Public URL |

### Database
`DB_HOST`, `DB_PORT` (5432), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL` (bool).

### Redis
`REDIS_HOST`, `REDIS_PORT` (6379), `REDIS_PASSWORD`.

### Auth
| Var | Default | Notes |
|---|---|---|
| `JWT_SECRET` | — | required; generate `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | — | must differ from JWT_SECRET |
| `ACCESS_TOKEN_EXPIRY` | 15m | access JWT TTL |
| `REFRESH_TOKEN_EXPIRY_DAYS` | 7 | refresh lifetime |
| `BCRYPT_ROUNDS` | 10–12 | hashing cost |
| `MAX_LOGIN_ATTEMPTS` | 5 | lockout threshold |
| `LOCKOUT_DURATION_MINUTES` | — | lockout window |
| `MAX_CONCURRENT_SESSIONS` | — | session cap |
| `CSRF_SECRET` | — | state-change CSRF protection |

### CORS
`CORS_ORIGIN` — comma-separated allowed origins (e.g., `http://localhost:5173`).

### Storage & Objects
`MINIO_ENDPOINT`, `MINIO_PORT` (9000), `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` (vision-erp), optional `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`/`SUPABASE_BUCKET`.

### Email & SMS
`SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; optional `SENDGRID_API_KEY`; `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.

### WhatsApp
`WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

### Payments
`FAWRY_MERCHANT_CODE`, `FAWRY_SECURITY_KEY`, `INSTAPAY_WALLET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### AI
`AI_PROVIDER` (none by default), `AI_API_KEY`, `AI_MODEL`, plus `ELASTICSEARCH_URL` (optional).

### Observability
`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `APP_VERSION`.

### Backup
`BACKUP_S3_BUCKET`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_RETENTION`.

### Encryption
`ENCRYPTION_KEY` — AES-256-GCM key for PII fields (required in prod).

## 3. Env File Setup

```powershell
Copy-Item .env.example .env
Copy-Item .env.docker.example .env.docker
# edit both; generate JWT secrets with:
#   -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

## 4. Validation on Boot

- Development: `validateDevelopmentEnvironment()` warns on missing optional vars.
- Production: `validateProductionEnvironment()` throws if required vars missing (fail-fast).

## 5. Secrets Hygiene

- `.env*` and `secrets/` are gitignored; templates are committed.
- Docker secrets: mount files; config loader checks `*_FILE` env convention first.
- Rotate `JWT_SECRET`/`JWT_REFRESH_SECRET` and `ENCRYPTION_KEY` per security policy; key rotation affects encrypted fields (decrypt→re-encrypt job).

---

*Related: [Environment](ENVIRONMENT.md) · [Deployment](DEPLOYMENT.md) · [Security](SECURITY.md)*
