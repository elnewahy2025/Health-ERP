# Environment — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved

---

## 1. Environments

| Env | Backend | Frontend | DB | Redis | MinIO | Notes |
|---|---|---|---|---|---|---|
| Local dev | :3000 (`npm run dev`) | :5173 (Vite) | Docker postgres :5432 | Docker redis :6379 | Docker minio :9000/9001 | `NODE_ENV=development` |
| CI | ephemeral | — | service container | service container | — | `NODE_ENV=test` |
| Staging | Railway/Docker | Vercel preview | managed pg | managed redis | S3-compatible | pre-prod validation |
| Production | Railway/Docker | Vercel/nginx :80 | managed pg | managed redis | MinIO/S3 | `NODE_ENV=production` |

## 2. Local Topology

```text
┌────────────┐   :5173   ┌────────────────────┐   :3000   ┌──────────────────┐
│ Frontend   │ ────────► │ Backend (Fastify)  │ ────────► │ Postgres 15      │
│ Vite dev   │           │ tsx watch          │           │ Redis 7          │
└────────────┘           └────────────────────┘           │ MinIO            │
                                                          └──────────────────┘
```

## 3. Infrastructure Services

| Service | Version | Port | Image | Purpose |
|---|---|---|---|---|
| PostgreSQL | 15 | 5432 | postgres:15-alpine | Primary DB (RLS, pg_trgm) |
| Redis | 7 | 6379 | redis:7-alpine | Sessions, queues, rate limits, cache |
| MinIO | latest | 9000/9001 | minio/minio | Documents, backups, object storage |
| Nginx (prod) | stable | 80/443 | nginx | Static frontend + reverse proxy |
| Backup (prod) | — | — | custom | Encrypted S3 backups |

## 4. Data Directories (Docker volumes)

`postgres_data`, `redis_data`, `minio_data` (defined in `docker-compose.yml`).
Removing volumes wipes local data: `docker compose down -v`.

## 5. Networking

- Backend binds `HOST=0.0.0.0`, `PORT=3000`.
- Frontend dev server on `:5173`; CORS origin must include `http://localhost:5173`.
- Prod: frontend on :80 via nginx; API proxied to backend.
- MinIO console :9001 (admin UI).

## 6. Verification

```powershell
docker compose up -d postgres redis minio
docker compose ps          # all healthy
curl http://localhost:3000/health
# open http://localhost:5173
```

---

*Related: [Deployment](DEPLOYMENT.md) · [Configuration](CONFIGURATION.md)*
