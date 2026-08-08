# Deployment — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Deployment Targets

| Target | Mechanism | Use case |
|---|---|---|
| Local dev | Docker Compose (`docker-compose.yml`) | infra only (postgres, redis, minio) + `npm run dev` |
| Self-hosted prod | `docker-compose.prod.yml` | full stack incl. nginx + backup |
| Railway | Nixpacks (`railway.json`) | managed backend (API) |
| **Vercel (production frontend)** | `vercel.json` + CI workflow | managed SPA hosting + API proxy — **live at https://vision-healthcare-erp.vercel.app** |

**Production topology:** backend API runs on Railway (`railway.json`, `node dist/index.js`);
the frontend SPA runs on Vercel and proxies `/api/*` to the backend through `vercel.json`
rewrites (same-origin, no CORS changes required).

## 2. Build Pipeline

```text
npm install
  └─ prepare → npm run build -w packages/shared   (dist for workspace consumers)
npm run build
  ├─ shared  → tsc          (emits dist/)
  ├─ backend → tsc          (emits dist/)
  └─ frontend→ tsc && vite build (emits dist/)
```

- **CI:** `.github/workflows/ci.yml` — on push/PR to `main`: checkout → node 20 → `npm ci` →
  build shared → build backend → build frontend → `npm test` (with postgres/redis services).
- **Gate:** any failure blocks merge; deploy job runs after test on `main` pushes.

## 3. Container Images

| Image | Base | Notes |
|---|---|---|
| `Dockerfile.backend` | node:20-alpine | multi-stage; non-root `appuser:1001`; `node dist/index.js` |
| `Dockerfile.frontend` | node → nginx | Vite build served by nginx; `VITE_API_URL` build arg |
| `Dockerfile.backup` | — | S3 backup job |

## 4. Production Compose Stack (`docker-compose.prod.yml`)

Services: `postgres` (15-alpine), `redis` (7-alpine), `minio`, `backend`, `frontend` (nginx :80),
`nginx` reverse proxy (if separate), `backup`. All have healthchecks; backend depends on
postgres/redis/minio healthy; frontend depends on backend healthy.

```powershell
# Windows PowerShell
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git; cd vision-healthcare-erp; Copy-Item .env.example .env; docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

```bash
# Linux/macOS
git clone https://github.com/elnewahy2025/vision-healthcare-erp.git && cd vision-healthcare-erp && cp .env.example .env && docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

## 5. Configuration Management

- `.env` (app) and `.env.docker` (containers); secrets via env or Docker secrets `_FILE` convention.
- Backend validates environment on boot (`validateProductionEnvironment` / `validateDevelopmentEnvironment`).
- Never commit `.env*` (`.gitignore`); use `.env.example` as the template.

## 5b. Vercel Production (Frontend)

### Configuration (`vercel.json` at repo root)
- `framework: "vite"`, `outputDirectory: "packages/frontend/dist"`
- `installCommand: "npm install"` (installs workspaces, runs `prepare` → builds shared)
- `buildCommand: "npm run build -w packages/shared && npm run build -w packages/frontend"`
- Rewrites:
  - `/api/(.*)` → `https://<BACKEND_URL>/api/$1` (backend host set in `vercel.json`)
  - `/queue/display/:branchId*` → backend `/api/v1/queue/display/$branchId`
  - SPA fallback → `/index.html`
- Headers: immutable caching for `/assets/*`; security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).

### One-time setup
1. Create a Vercel project and link it:
   ```bash
   vercel login
   vercel link   # selects repo root (monorepo)
   ```
2. Backend URL: set in `vercel.json` rewrites — currently `https://vision-healthcare-erp-production.up.railway.app`.
3. GitHub Actions secrets (auto-deploy, `.github/workflows/vercel.yml`):
   - `VERCEL_TOKEN` — create in Vercel → Account Settings → Tokens
   - `VERCEL_ORG_ID` — `vercel teams ls` (or dashboard → settings → ID)
   - `VERCEL_PROJECT_ID` — `vercel projects ls` / project settings
4. Deploy manually once: `vercel --prod`

### Automatic deploys
- Push to `main` → production deploy (job `Deploy Frontend to Vercel`).
- Pull requests → preview deploy with a unique URL.
- Workflow is skipped until `VERCEL_TOKEN` secret exists.

### Known limitations on Vercel
- WebSocket proxying to an external backend is not supported by Vercel rewrites.
  Real-time features that depend on WS (chat, telemedicine waiting room, voice,
  live queue push) fall back to polling or require a WS-capable host for those
  channels; the queue display page has a built-in polling fallback.
- Long-running jobs (BullMQ workers) stay on the backend (Railway/Docker), never Vercel.

### Rollback
`vercel rollback <deployment-url>` or redeploy a previous deployment from the Vercel dashboard.

## 6. Migrations in Deploy

```bash
npm run migrate        # knex migrate:latest (applies 001–029)
```

Run migrations before starting new backend replicas; CI applies on a staging DB first.

## 7. Health Checks & Monitoring

- `GET /health` on backend; container healthchecks (`wget --spider`).
- Logs: pino JSON; `LOG_LEVEL` configurable.
- Sentry optional; system monitor module exposes in-app metrics/alerts.

## 8. Rollback Strategy

1. Keep previous image tag / Railway deployment pinned.
2. Backend rollback = redeploy previous build (stateless; migrations forward-compatible).
3. Schema changes: forward-fix migrations only; never destructive on deploy.
4. Frontend rollback = redeploy previous static build (nginx).

## 9. Scaling Strategy

- Backend: stateless → scale replicas behind nginx/Railway; Redis for sessions/rate limits/queues.
- Frontend: static assets CDN-cacheable.
- DB: read replicas for reporting; `dw_*` aggregates offload analytics.
- Queues: BullMQ workers can run as separate processes.

## 10. Disaster Recovery

- Encrypted S3 backups daily; retention configurable; restore runbook in `docs/security/INCIDENT_RESPONSE.md`.
- RTO ≤ 4 h, RPO ≤ 24 h (default); test restore quarterly.

## 11. Troubleshooting (common)

| Symptom | Fix |
|---|---|
| `TS2307: Cannot find module '@healthcare/shared/...'` | Delete `tsconfig.tsbuildinfo` files, `npm run build` |
| `TS2305: ... no exported member 'screen'` | `npm install` (missing `@testing-library/dom`) |
| Containers unhealthy | `docker compose ps`, check env, `docker compose logs backend` |
| Port conflicts | 3000/5173/5432/6379/9000/9001 must be free |

---

*Related: [Environment](ENVIRONMENT.md) · [Configuration](CONFIGURATION.md) · [Release plan](../project-management/RELEASE-PLAN.md)*
