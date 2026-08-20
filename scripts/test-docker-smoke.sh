#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="health-erp-release-smoke-${GITHUB_RUN_ID:-$$}"
COMPOSE=(docker compose -p "$PROJECT_NAME" --env-file "$ROOT_DIR/.env")
BACKEND_PORT="${RELEASE_SMOKE_BACKEND_PORT:-3001}"
FRONTEND_PORT="${RELEASE_SMOKE_FRONTEND_PORT:-8080}"
POSTGRES_PORT="${RELEASE_SMOKE_POSTGRES_PORT:-55432}"
REDIS_PORT="${RELEASE_SMOKE_REDIS_PORT:-56379}"
MINIO_PORT="${RELEASE_SMOKE_MINIO_PORT:-59000}"
MINIO_CONSOLE_PORT="${RELEASE_SMOKE_MINIO_CONSOLE_PORT:-59001}"

if [[ -e "$ROOT_DIR/.env" ]]; then
  echo "Refusing Docker smoke test because $ROOT_DIR/.env already exists; use an isolated checkout or run the stack manually." >&2
  exit 2
fi

cleanup() {
  set +e
  "${COMPOSE[@]}" down --volumes --remove-orphans >/tmp/health-erp-docker-smoke-${PROJECT_NAME}.log 2>&1
  rm -f "$ROOT_DIR/.env"
}
trap cleanup EXIT

cat >"$ROOT_DIR/.env" <<EOF
NODE_ENV=production
APP_VERSION=ci-smoke
APP_COMMIT_SHA=${GITHUB_SHA:-local-docker-smoke}
REDIS_REQUIRED=true
OBJECT_STORAGE_REQUIRED=true
WORKERS_REQUIRED=true
COOKIE_SECURE=false
POSTGRES_USER=postgres
POSTGRES_PASSWORD=ci-postgres-password-2026
POSTGRES_DB=health_erp_ci
POSTGRES_PORT=${POSTGRES_PORT}
DB_HOST=127.0.0.1
DB_PORT=${POSTGRES_PORT}
DB_NAME=health_erp_ci
DB_USER=postgres
DB_PASSWORD=ci-postgres-password-2026
DB_SSL=false
REDIS_PASSWORD=ci-redis-password-2026
REDIS_PORT=${REDIS_PORT}
JWT_SECRET=ci-jwt-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
JWT_REFRESH_SECRET=ci-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CSRF_SECRET=ci-csrf-secret-cccccccccccccccccccccccccccccccc
CORS_ORIGIN=http://127.0.0.1:${FRONTEND_PORT}
APP_URL=http://127.0.0.1:${FRONTEND_PORT}
MINIO_ROOT_USER=ci-minio-user
MINIO_ROOT_PASSWORD=ci-minio-password-2026
MINIO_PORT=${MINIO_PORT}
MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT}
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
VITE_API_URL=/api/v1
SKIP_AUTO_MIGRATE=true
EOF

wait_for() {
  local description="$1"
  local command="$2"
  local attempts="${3:-60}"
  for ((i = 1; i <= attempts; i += 1)); do
    if bash -c "$command" >/dev/null 2>&1; then
      echo "✓ $description"
      return 0
    fi
    sleep 2
  done
  echo "✗ Timed out waiting for $description" >&2
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs --tail=120 >&2 || true
  return 1
}

cd "$ROOT_DIR"
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" up -d --build postgres redis minio
wait_for "PostgreSQL" "PGPASSWORD=ci-postgres-password-2026 pg_isready -h 127.0.0.1 -p ${POSTGRES_PORT} -U postgres -d health_erp_ci"
wait_for "Redis" "docker compose -p ${PROJECT_NAME} --env-file ${ROOT_DIR}/.env exec -T redis redis-cli -a ci-redis-password-2026 ping | grep -q PONG"
wait_for "MinIO" "curl -fsS http://127.0.0.1:${MINIO_PORT}/minio/health/live"

DB_HOST=127.0.0.1 DB_PORT="$POSTGRES_PORT" DB_NAME=health_erp_ci DB_USER=postgres DB_PASSWORD=ci-postgres-password-2026 DB_MIGRATION_USER=postgres DB_MIGRATION_PASSWORD=ci-postgres-password-2026 NODE_ENV=test npm run migration:gate
"${COMPOSE[@]}" up -d --build backend frontend
wait_for "backend liveness" "curl -fsS http://127.0.0.1:${BACKEND_PORT}/api/v1/health/live"
wait_for "backend readiness" "curl -fsS http://127.0.0.1:${BACKEND_PORT}/api/v1/health/ready"
wait_for "frontend SPA" "curl -fsS http://127.0.0.1:${FRONTEND_PORT}/ | grep -q '<div id=\"root\"'"

health_headers="$(curl -fsS -D - -o /tmp/health-erp-docker-smoke-health.json http://127.0.0.1:${BACKEND_PORT}/api/v1/health/live)"
grep -qi '^x-request-id:' <<<"$health_headers"
grep -q '"status"' /tmp/health-erp-docker-smoke-health.json
curl -fsSI http://127.0.0.1:${FRONTEND_PORT}/ | grep -qi '^x-content-type-options: nosniff'

"${COMPOSE[@]}" ps
printf '%s\n' 'Docker smoke gate passed.'
