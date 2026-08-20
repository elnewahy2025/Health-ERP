#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${SMOKE_BASE_URL:?SMOKE_BASE_URL is required}"
EXPECTED_COMMIT_SHA="${SMOKE_EXPECTED_COMMIT_SHA:-}"
ACCESS_TOKEN="${SMOKE_ACCESS_TOKEN:?SMOKE_ACCESS_TOKEN is required}"
TENANT_SLUG="${SMOKE_TENANT_SLUG:?SMOKE_TENANT_SLUG is required}"
BASE_URL="${BASE_URL%/}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

request() {
  local name="$1"
  local url="$2"
  shift 2
  local headers="$workdir/${name}.headers"
  local body="$workdir/${name}.body"
  curl --fail-with-body --silent --show-error --max-time "${SMOKE_TIMEOUT_SECONDS:-15}" \
    -D "$headers" -o "$body" "$@" "$url"
  printf '%s\n' "$headers" "$body"
}

health_files=( $(request health "$BASE_URL/health") )
ready_files=( $(request ready "$BASE_URL/api/v1/health/ready" -H 'X-API-Version: v1') )
live_files=( $(request live "$BASE_URL/api/v1/health/live" -H 'X-API-Version: v1') )
me_files=( $(request me "$BASE_URL/api/v1/auth/me" -H 'X-API-Version: v1' -H "Authorization: Bearer ${ACCESS_TOKEN}" -H "X-Tenant-Slug: ${TENANT_SLUG}") )

for file in "${health_files[@]}" "${ready_files[@]}" "${live_files[@]}" "${me_files[@]}"; do
  [[ -s "$file" ]] || { echo "Smoke response file is empty: $file" >&2; exit 1; }
done

grep -qi '^x-request-id:' "${health_files[0]}"
grep -qi '^x-request-id:' "${ready_files[0]}"
grep -qi '^x-api-version-resolved: v1' "${ready_files[0]}"
grep -qi '^x-api-version-resolved: v1' "${live_files[0]}"
grep -q '"status"' "${health_files[1]}"
grep -q '"status"' "${ready_files[1]}"
grep -q '"user"' "${me_files[1]}"
grep -qi '^x-content-type-options: nosniff' "${health_files[0]}"
grep -qi '^strict-transport-security:' "${health_files[0]}"

if [[ -n "$EXPECTED_COMMIT_SHA" ]]; then
  grep -q "$EXPECTED_COMMIT_SHA" "${health_files[1]}" || {
    echo "Deployed health identity does not contain the expected commit SHA." >&2
    exit 1
  }
fi

printf '%s\n' 'Post-deploy smoke gate passed: health, liveness, readiness, API version, security headers, commit identity, and authenticated principal access.'
