#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-80}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.docker.example to .env and fill disposable local values first." >&2
  exit 1
fi

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
"${compose[@]}" config >/dev/null
"${compose[@]}" build
"${compose[@]}" up -d
"${compose[@]}" ps

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/api/v1/health/ready" >/dev/null 2>&1 \
    && curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1; then
    echo "Local Compose stack is ready."
    echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}/"
    echo "Backend health: http://127.0.0.1:${BACKEND_PORT}/health"
    echo "Backend readiness: http://127.0.0.1:${BACKEND_PORT}/api/v1/health/ready"
    echo "No demo credentials are created or printed by this helper."
    exit 0
  fi
  sleep 2
done

echo "Compose services did not become ready. Inspect logs with:"
printf '  %q ' "${compose[@]}" logs --tail=200 backend frontend
printf '\n'
exit 1
