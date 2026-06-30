#!/usr/bin/env bash
# Task 26.3 — local staging parity: Axum serves Dioxus bundle on one port (like Hostinger :3003).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "${ROOT}/.envrc.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.envrc.local"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev}"
export JWT_SECRET="${JWT_SECRET:-geosyntra-staging-smoke-secret}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-$JWT_SECRET}"
export GEOSYNTRA_API_PORT="${GEOSYNTRA_STAGING_PORT:-3004}"
export GEOSYNTRA_BIND_HOST="${GEOSYNTRA_BIND_HOST:-127.0.0.1}"
export APP_ORIGIN="${APP_ORIGIN:-http://127.0.0.1:${GEOSYNTRA_API_PORT}}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://127.0.0.1:${GEOSYNTRA_API_PORT}}"

API_PID=""
STAGING_URL="http://127.0.0.1:${GEOSYNTRA_API_PORT}"

cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

start_axum() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  cargo run -p geosyntra-api --release &
  API_PID=$!
  for _ in $(seq 1 120); do
    curl -sf "${STAGING_URL}/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -sf "${STAGING_URL}/health" | grep -qx ok
}

echo "==> Postgres"
bash scripts/dev-postgres.sh start

echo "==> Dioxus release bundle (production-like static assets)"
bash scripts/build-dioxus-web.sh
export GEOSYNTRA_WEB_DIST="${ROOT}/target/dx/geosyntra-web/release/web/public"

echo "==> Axum staging (single origin) on ${STAGING_URL}"
start_axum

echo "==> Smoke (SSR + release wasm + admin API via ${STAGING_URL})"
GEOSYNTRA_WEB_URL="$STAGING_URL" GEOSYNTRA_API_URL="$STAGING_URL" bash scripts/smoke-dioxus-web.sh

if [[ "${RUN_PLAYWRIGHT:-1}" == "1" ]]; then
  echo "==> Playwright against release bundle on local staging (${STAGING_URL})"
  GEOSYNTRA_WEB_URL="$STAGING_URL" GEOSYNTRA_API_URL="$STAGING_URL" bash scripts/run-dioxus-playwright.sh
fi

echo "local-staging-smoke: OK (${STAGING_URL})"
