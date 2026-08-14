# 🏥 Vision Healthcare ERP

**Enterprise Healthcare SaaS Platform** — A multi-tenant Electronic Medical Records (EMR) and Practice Management system designed for the **Egyptian healthcare market**. Covers the full patient lifecycle from appointment scheduling through billing, with AI-powered clinical decision support, real-time analytics, and multi-branch management.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![License](https://img.shields.io/badge/license-MIT-green)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)
![Tests](https://img.shields.io/badge/tests-154%20passing-brightgreen)
![Security](https://img.shields.io/badge/security-OWASP%20Top%2010%20PASS-green)

---

## 📋 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Documentation](#-documentation)
- [Quick Start](#-quick-start)
- [Production Deployment](#-production-deployment)
- [Troubleshooting](#-troubleshooting)
- [Environment Variables](#-environment-variables)
- [Docker Secrets](#-docker-secrets)
- [Backend Modules](#backend-modules)
- [Security](#-security)
- [Testing](#-testing)
- [Production Readiness Audit](#-production-readiness-audit)
- [Egypt Market Features](#egypt-market-features)
- [Project Statistics](#-project-statistics)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📚 Documentation

The complete production-grade documentation package lives in [`docs/`](docs/index.md).
It covers product, engineering, security, testing, deployment, project management, AI,
and per-module documentation — always kept in sync with the codebase.

| Area | Index |
|---|---|
| All documents | [docs/index.md](docs/index.md) |
| Core (PRD, specs, architecture, decisions, roadmap) | [docs/core](docs/core/) |
| Engineering (API, DB, security, testing, deployment, config) | [docs/engineering](docs/engineering/) |
| Product (UX, design system, content, accessibility) | [docs/product](docs/product/) |
| Project management | [docs/project-management](docs/project-management/) |
| AI | [docs/ai](docs/ai/) |
| Modules (auth, patient, EMR, billing, …) | [docs/modules](docs/modules/) |

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│              Frontend (React 18 + Vite + TailwindCSS)       │
│  82 Pages | Code-Split | Lazy-Loaded | Recharts Analytics   │
│  React Query | In-Memory Tokens | XSS Sanitization          │
├─────────────────────────────────────────────────────────────┤
│              Nginx Reverse Proxy (SSL + Rate Limiting)      │
│  HSTS | CSP | X-Frame-Options | Permissions-Policy          │
├─────────────────────────────────────────────────────────────┤
│              Backend (Fastify 4 + TypeScript)                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐     │
│  │ 57 Modules   │  │ 17 Services  │  │ Shared Package│     │
│  │ Clean Arch   │  │ Email, SMS,  │  │ Types, Zod,   │     │
│  │ (core modules│  │ Audit, PDF,  │  │ Errors, i18n, │     │
│  │  decomposed) │  │ Crypto, TOTP │  │ Validators    │     │
│  └──────────────┘  └──────────────┘  └───────────────┘     │
├─────────────────────────────────────────────────────────────┤
│              PostgreSQL 15 + Redis 7 + MinIO                │
│  Row Level Security | AES-256-GCM Encryption | pg_trgm      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, React Query, react-router-dom, i18next |
| **Backend** | Fastify 4, TypeScript, Knex.js (query builder), Zod (validation) |
| **Database** | PostgreSQL 15 (Row Level Security, AES-256-GCM encryption) |
| **Cache** | Redis 7 (session store, rate limiting) |
| **Storage** | MinIO (S3-compatible, patient documents, prescriptions) |
| **Proxy** | Nginx (SSL termination, rate limiting, security headers) |
| **Container** | Docker, Docker Compose (multi-stage builds, non-root user) |
| **CI/CD** | GitHub Actions (build, test, lint) |
| **Monitoring** | pino + pino-http (structured logging with redaction) |
| **Testing** | Vitest (backend), TypeScript compiler (type checking) |

---

## 📁 Project Structure

```
vision-healthcare-erp/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── modules/          # 57 feature modules
│   │   │   │   ├── auth/         # Clean Architecture (7 files)
│   │   │   │   ├── patient/      # Clean Architecture (7 files)
│   │   │   │   ├── appointment/  # Clean Architecture (7 files)
│   │   │   │   ├── inventory/    # Clean Architecture (7 files)
│   │   │   │   ├── billing/      # Monolith (fixed in-place)
│   │   │   │   ├── emr/          # Monolith (fixed in-place)
│   │   │   │   ├── financial-deepening/
│   │   │   │   ├── patient-portal/
│   │   │   │   └── ... (49 more)
│   │   │   ├── services/         # 17 shared services
│   │   │   ├── core/             # Database, Redis, config
│   │   │   └── utils/            # Logger, validators, helpers
│   │   ├── migrations/           # 29 Knex migrations
│   │   └── __tests__/            # 20 test files, 154 tests
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── pages/            # 82 lazy-loaded pages
│   │   │   ├── components/       # 19 shared UI components
│   │   │   ├── hooks/            # React Query hooks
│   │   │   ├── lib/api/          # 20+ domain API clients
│   │   │   ├── stores/           # Auth + Theme context
│   │   │   ├── i18n/             # EN + AR translations
│   │   │   └── styles/           # TailwindCSS + globals
│   │   └── index.html
│   └── shared/
│       └── src/
│           ├── config/           # Environment + validation
│           ├── errors/           # Custom error classes
│           ├── types/            # Shared TypeScript types
│           └── utils/            # Crypto, validators, formatters
├── deployment/
│   └── nginx/                    # dev.conf, prod.conf, default.conf
├── scripts/                      # backup.sh, generate-icons.mjs
├── secrets/                      # Docker Secrets (.example files)
├── docs/                         # Final Audit Report
├── Dockerfile.backend            # Non-root (appuser:1001)
├── Dockerfile.frontend           # Non-root (appuser:1001)
├── Dockerfile.backup             # Non-root (appuser:1001)
├── docker-compose.yml            # Development
├── docker-compose.prod.yml       # Production (Docker Secrets)
└── .github/
    ├── workflows/ci.yml          # CI/CD pipeline
    └── dependabot.yml            # Automated dependency updates
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | v20+ (v22 recommended) | `winget install OpenJS.NodeJS.LTS` or [nodejs.org](https://nodejs.org) |
| Docker Desktop | Latest | `winget install Docker.DockerDesktop` |
| Git | Latest | `winget install Git.Git` |

### Windows (PowerShell)

```powershell
# Clone
cd C:\Projects
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git
cd vision-healthcare-erp

# Create environment files
Copy-Item .env.example .env
Copy-Item .env.docker.example .env.docker
# Edit both .env and .env.docker with your credentials

# Generate JWT secrets (run twice, use each output once)
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })

# Start infrastructure
docker compose up -d postgres redis minio
docker compose ps   # wait until all show 'healthy'

# Install dependencies (builds shared package automatically)
npm install

# Build all packages (shared → backend → frontend)
npm run build

# Run database migrations
cd packages/backend && npm run migrate && cd ../..

# Start dev servers (backend :3000, frontend :5173)
npm run dev
```

### Linux / macOS

```bash
# Clone
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git
cd vision-healthcare-erp

# Create environment files
cp .env.example .env
cp .env.docker.example .env.docker
# Edit both .env and .env.docker with your credentials

# Start infrastructure
docker compose up -d postgres redis minio

# Install dependencies and build
npm install
npm run build

# Run migrations
cd packages/backend && npm run migrate && cd ../..

# Start dev servers
npm run dev
```

### Build

```bash
# Full build (shared → backend → frontend) — always use this
npm run build

# Or build individual packages
npm run build -w packages/shared
npm run build -w packages/backend
npm run build -w packages/frontend
```

---

## 💻 Production on Windows (backend on your PC, frontend on Vercel)

This is the current production topology: the frontend is deployed on Vercel and
the API is served from your Windows PC (database on Neon). Two options:

### Option A — Automated (recommended)

```powershell
# From the repo root (or run anywhere - the script clones the repo if missing)
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1

# First time on a fresh database: also seed the demo data
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -Seed

# Start a tunnel at the end, then point Vercel at it:
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -StartTunnel
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -UpdateVercel -TunnelUrl https://xxxx.trycloudflare.com
```

The script checks Node/npm/Git, copies `.env.production` to `.env`, runs
`npm install`, builds `shared` + `backend`, runs migrations, optionally seeds,
and starts the backend. See `scripts/setup-windows.ps1` for all switches
(`-SkipInstall`, `-SkipMigrate`, `-NoStart`, ...).

### Option B — Manual

```powershell
# 1. Prerequisites: Node.js 20.19+ (winget install OpenJS.NodeJS.LTS), Git
# 2. Get the code and the environment file
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git
cd vision-healthcare-erp
# Put the production .env.production (with the Neon URL, JWT/CSRF secrets,
# CORS_ORIGIN=https://vision-healthcare-erp.vercel.app) in the repo root.

# 3. Prepare env + install + build backend only (frontend is on Vercel)
Copy-Item .env.production .env -Force
npm install
npm run build -w packages/shared
npm run build -w packages/backend

# 4. Database
npm run migrate          # apply all migrations (037 included)
npm run seed             # only the first time / when you want demo data

# 5. Start the API
cd packages\backend
node dist/index.js       # listens on PORT (3000), uses root .env
```

### Expose the API to Vercel (tunnel)

The Vercel frontend proxies `/api/*` to your PC, so the PC must be reachable
over HTTPS:

```powershell
# Tailscale Funnel (easiest if you have Tailscale)
tailscale funnel 3000

# Or Cloudflare Tunnel (no account needed for quick tunnels)
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Then update `vercel.json` (replace every `https://...railway.app` with your
tunnel URL), commit and push — Vercel redeploys automatically:

```powershell
git add vercel.json && git commit -m "chore: point API rewrites at tunnel" && git push
```

**Notes**

- The `.env` file at the repo root is gitignored — never commit secrets.
- Redis/email/SMS/WhatsApp are optional: the backend degrades gracefully
  (queue jobs, notifications and OTP sending need their own credentials).
- Uploaded files are stored locally in `packages\backend\uploads\` unless
  Supabase/MinIO storage credentials are configured.

---

## 🐳 Production Deployment

### Windows 11 (PowerShell)

```powershell
# One-command production build and deploy
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git; cd vision-healthcare-erp; Copy-Item .env.example .env; docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

This command will:
1. Clone the repository
2. Copy the environment template
3. Build all Docker images (multi-stage, non-root)
4. Start all services (PostgreSQL, Redis, MinIO, Backend, Frontend, Nginx, Backup)

### Linux / macOS

```bash
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git && \
cd vision-healthcare-erp && \
cp .env.example .env && \
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

### Post-Deployment Setup

```bash
# Create Docker Secrets (production)
cp secrets/*.txt.example secrets/*.txt
# Edit each file with real secrets:
#   openssl rand -hex 32  # Generate a secret

# Run database migrations
docker exec visionhc-backend npx knex migrate:latest

# Verify health
curl http://localhost:3000/api/v1/health
```

---

### Live Production (Vercel + Railway)

The project is deployed end-to-end (frontend, API proxy, backend, Postgres):

| Component | URL |
|---|---|
| Frontend (Vercel) | https://vision-healthcare-erp.vercel.app |
| Backend API (Railway) | https://vision-healthcare-erp-production.up.railway.app |
| API docs | https://vision-healthcare-erp-production.up.railway.app/docs |
| Health check | https://vision-healthcare-erp-production.up.railway.app/api/v1/health |

**Demo credentials** (seeded via `npm run seed -w packages/backend`, tenant slug `demo`):

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@demo.com` | `Admin@123` |
| Doctor | `doctor@demo.com` | `Doctor@123` |
| Receptionist | `reception@demo.com` | `Recept@123` |

**Login payload** — the API requires a tenant slug:

```json
{ "email": "admin@demo.com", "password": "Admin@123", "tenantSlug": "demo" }
```

**Deploying updates**

- Backend: push to `main` → Railway builds via `railway.json` (`npm install --include=dev`, builds `shared` + `backend`) and runs `npm run migrate` before starting.
- Frontend: push to `main` → Vercel builds the SPA and proxies `/api/*` to the Railway backend (see `vercel.json`).

**Notes**

- `/api/v1/health` reports `redis: degraded` because no Redis service is provisioned yet — rate limiting and background queues are the only features affected; the rest of the app is fully functional.
- Migrations and demo seed run against Railway Postgres; `packages/shared` `dist` is rebuilt automatically by the Railway build so `@healthcare/shared/*` subpath imports resolve from the workspace symlink.

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Required |
|----------|-------------|----------|
| `DB_HOST` | PostgreSQL host | ✅ |
| `DB_PORT` | PostgreSQL port | ✅ |
| `DB_NAME` | Database name | ✅ |
| `DB_USER` | Database user | ✅ |
| `DB_PASSWORD` | Database password | ✅ |
| `REDIS_HOST` | Redis host | ✅ |
| `REDIS_PASSWORD` | Redis password | ✅ |
| `JWT_SECRET` | JWT signing secret (32+ hex chars) | ✅ |
| `JWT_REFRESH_SECRET` | Refresh token secret (different from JWT_SECRET) | ✅ |
| `CORS_ORIGIN` | Allowed CORS origins | ✅ |
| `MINIO_ENDPOINT` | MinIO/S3 endpoint | ✅ |
| `MINIO_ACCESS_KEY` | MinIO access key | ✅ |
| `MINIO_SECRET_KEY` | MinIO secret key | ✅ |

> **Generate secrets:** `openssl rand -hex 32`

---

## 🔐 Docker Secrets

Production uses Docker Secrets for sensitive credentials (not environment variables):

```bash
# Create secret files
cp secrets/*.txt.example secrets/*.txt
nano secrets/db_password.txt      # Real DB password
nano secrets/jwt_secret.txt       # Real JWT secret
nano secrets/jwt_refresh_secret.txt
```

The backend reads secrets via the `_FILE` convention:
- `DB_PASSWORD_FILE=/run/secrets/db_password`
- `JWT_SECRET_FILE=/run/secrets/jwt_secret`
- `JWT_REFRESH_SECRET_FILE=/run/secrets/jwt_refresh_secret`

---

## 📦 Backend Modules

### Core Modules (Clean Architecture)

| Module | Files | Description |
|--------|-------|-------------|
| `auth/` | 7 files | Authentication, MFA, OTP, JWT, account lockout |
| `patient/` | 7 files | Egyptian NID validation, AES-256-GCM encryption, RLS |
| `appointment/` | 6 files | Scheduling, reminders, telemedicine links |
| `inventory/` | 7 files | Stock management, purchase orders, warehouses |

### Other Modules (20+)

| Module | Description |
|--------|-------------|
| `billing/` | Invoicing, payments, Stripe/Fawry/InstaPay |
| `emr/` | Electronic Medical Records |
| `financial-deepening/` | Expenses, budgets, ETA invoicing, payments |
| `patient-portal/` | Patient-facing OTP login, dashboard |
| `patient-experience/` | Kiosk check-in, surveys, queue management |
| `advanced-communication/` | Chat, voice calls, WhatsApp, SMS |
| `ai-intelligence/` | Clinical AI, predictive analytics |
| `compliance/` | HIPAA, PDPL, audit trails |
| `insurance-claims/` | Claims lifecycle management |
| `laboratory/` | Lab orders, results, catalog |
| `pharmacy/` | Prescriptions, inventory |
| `radiology/` | Orders, DICOM links |
| `hr/` | Employees, payroll, leave |
| `crm/` | Campaigns, patient feedback |
| `dms/` | Document management |
| `automation/` | Business rules engine |
| `barcodes/` | Label generation, scanning |
| ... and 30+ more |

---

## 🔒 Security

### OWASP Top 10 Compliance

| Category | Status | Implementation |
|----------|--------|---------------|
| A01: Broken Access Control | ✅ PASS | RBAC + tenant isolation + RLS |
| A02: Cryptographic Failures | ✅ PASS | AES-256-GCM, bcrypt, crypto.randomInt |
| A03: Injection | ✅ PASS | Parameterized queries, Zod validation |
| A04: Insecure Design | ✅ PASS | Clean Architecture, defense-in-depth |
| A05: Security Misconfiguration | ✅ PASS | Security headers, rate limiting |
| A06: Vulnerable Components | ✅ PASS | Dependabot weekly updates |
| A07: Auth Failures | ✅ PASS | Account lockout, MFA, rate limiting |
| A08: Data Integrity | ✅ PASS | CSRF protection, JWT validation |
| A09: Logging Failures | ✅ PASS | Audit logging, pino with redaction |
| A10: SSRF | ✅ PASS | Webhook URL validation, IP blocking |

### Security Features

- **Authentication:** JWT (access + HttpOnly refresh cookies), MFA/TOTP, OTP
- **Authorization:** Role-Based Access Control (RBAC) with fine-grained permissions
- **Encryption:** AES-256-GCM for National IDs at rest, bcrypt for passwords
- **Rate Limiting:** Per-route limits (login: 5/min, API: 30/s, portal: 10/min)
- **Audit Logging:** Every write operation logged with tenant, user, IP, user-agent
- **Input Sanitization:** OWASP-compliant `sanitize.ts` with XSS prevention
- **Container Security:** Non-root user (appuser:1001) in all Dockerfiles
- **Secrets Management:** Docker Secrets with `_FILE` convention
- **Nginx Headers:** HSTS, CSP, X-Frame-Options, Permissions-Policy
- **SQL Injection:** Parameterized queries, no raw SQL with user input
- **Token Security:** Access tokens in memory only, refresh in HttpOnly cookies

---

## 🧪 Testing

```bash
# Run all backend tests
cd packages/backend && npx vitest run

# Run specific test file
cd packages/backend && npx vitest run src/modules/__tests__/auth.test.ts

# Type-check all packages
npm run build   # includes tsc for shared, backend, and frontend

# Or type-check individually
cd packages/backend && npx tsc --noEmit
cd packages/frontend && npx tsc --noEmit
```

### Test Results

| Metric | Value |
|--------|-------|
| Test files | 20 |
| Total tests | 154 |
| Passing | 154 ✅ |
| TypeScript errors | 0 |
| Coverage areas | Auth, Patient, Appointment, Billing, EMR, Inventory, Compliance, AI, HR, Reports, Forms, Workflows, CRM, Insurance, Financial |

---

## 📊 Production Readiness Audit

### Audit Status: ✅ COMPLETE

| Area | Status | Details |
|------|--------|---------|
| Backend Modules (20+) | ✅ | Tenant isolation, audit logging, type safety |
| Frontend Security | ✅ | In-memory tokens, XSS protection, 0 `any` types |
| Migrations | ✅ | 29 migrations, audit_logs schema fixed |
| Docker/Deployment | ✅ | Non-root containers, Docker Secrets, nginx hardening |
| Dead Link Audit | ✅ | 0 dead links between frontend and backend |
| `Math.random()` | ✅ | All replaced with `crypto.randomInt/Bytes` |
| `console.log` | ✅ | All removed from production code |
| ESLint Rules | ✅ | `no-explicit-any: error`, `curly: all`, `eqeqeq: always` |

### Key Security Fixes Applied

- AES-256-GCM encryption for Egyptian National IDs
- PostgreSQL Row Level Security (RLS) policies
- Unique partial indexes for race condition prevention
- SSRF protection on webhook URLs
- RBAC enforcement on admin endpoints
- Account lockout after 5 failed attempts
- Refresh token pre-rotation checks
- Incident response plan documented
- Dependabot configured for weekly updates

Full audit report: [`docs/FINAL_AUDIT_REPORT.md`](docs/FINAL_AUDIT_REPORT.md)

---

## 🇪🇬 Egypt Market Features

- **Egyptian National ID Validation:** Full checksum, governorate, birth date, gender verification
- **ETA E-Invoice Integration:** QR code generation, invoice submission, UUID tracking
- **Fawry Payment Integration:** Create and process Fawry payment requests
- **InstaPay Integration:** Wallet-to-wallet payment support
- **Bilingual UI:** Complete English + Arabic (2,674 i18n keys)
- **RTL Layout:** Automatic direction switching based on locale
- **EGP Currency:** Egyptian Pound formatting and calculations
- **Egyptian Phone Validation:** Supports 010/011/012/015 + international formats

---

## 📈 Project Statistics

| Metric | Value |
|--------|-------|
| Backend modules | 57 |
| Clean Architecture modules | 4 (auth, patient, appointment, inventory) |
| Backend services | 17 |
| Database migrations | 29 |
| API endpoints | 360+ |
| Frontend pages | 82 |
| Shared UI components | 19 |
| Frontend API clients | 20+ |
| React Query hooks | Domain-specific |
| i18n keys | 2,674 (EN + AR) |
| Backend test files | 20 |
| Backend tests | 154 |
| ESLint rules | Strict (no any, curly, eqeqeq, no-debugger error) |
| Security headers | 7 (HSTS, CSP, X-Frame, X-Content-Type, X-XSS, Referrer, Permissions) |
| OWASP categories | 10/10 PASS |
| Docker services | 7 (postgres, redis, minio, backend, frontend, nginx, backup) |

---

## 🤝 Contributing

1. Fork → `git checkout -b feature/my-feature`
2. Install: `npm install`
3. Build: `npm run build` (ensures shared package is compiled for backend/frontend)
4. Code: Follow existing module patterns (see Clean Architecture modules for reference)
5. Test: `cd packages/backend && npx vitest run`
6. Type-check: `npm run build` (includes tsc for all packages)
7. Commit: `git commit -m 'feat: Add my feature'`
8. Push: `git push origin feature/my-feature`
9. PR: Open pull request

> **Note:** The `*.tsbuildinfo` pattern in `.gitignore` is intentional — these are machine-local incremental build caches that must not be committed. If you see stale `TS2307` errors after pulling, delete them and rebuild: `Get-ChildItem -Path . -Filter "tsconfig.tsbuildinfo" -Recurse | Remove-Item -Force && npm run build`

### Code Conventions

- **TypeScript strict** — no `any` types (ESLint enforced)
- **Backend modules:** `registerXxxModule(app)` pattern
- **Decomposed modules:** `types.ts` → `schema.ts` → `repository.ts` → `controller.ts` → `routes.ts`
- **Frontend:** Lazy-loaded pages, `useTranslation()` for i18n
- **All text:** EN + AR translation keys (no hardcoded English)
- **Security:** `sanitizeString()` on all user inputs
- **Forms:** Zod validation with error display on every form
- **Actions:** `try/catch` with `toast.error()` on every async action
- **Components:** Use shared UI components (Modal, Button, Input, Select, Badge, etc.)
- **Audit:** `logAudit()` on all write operations
- **Crypto:** Use `crypto.randomInt()` / `crypto.randomBytes()` — never `Math.random()`

---

## 🔧 Troubleshooting

### `TS2307: Cannot find module '@healthcare/shared/...'`

The `packages/shared/dist` output is incomplete. Delete stale build caches and rebuild:

```powershell
# Windows
Get-ChildItem -Path . -Filter "tsconfig.tsbuildinfo" -Recurse | Remove-Item -Force
npm run build
```

```bash
# Linux / macOS
find . -name "tsconfig.tsbuildinfo" -delete
npm run build
```

### `TS2305: Module has no exported member 'screen' / 'waitFor'`

Missing `@testing-library/dom` peer dependency. Run:

```bash
npm install
```

This is already fixed in the repo — if you see it, you're on an older branch.

### Docker containers won't start

```powershell
docker compose down -v
docker compose up -d postgres redis minio
docker compose ps   # verify all healthy
```

### Port conflicts

The dev servers use:
- **Backend:** `localhost:3000`
- **Frontend:** `localhost:5173`
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`
- **MinIO:** `localhost:9000` (API) / `localhost:9001` (console)

Kill any process using these ports before starting.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built with ❤️ for the Egyptian healthcare ecosystem — Vision Healthcare ERP v2.0*
