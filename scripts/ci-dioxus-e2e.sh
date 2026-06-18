#!/usr/bin/env bash
# Task 25.8 — CI Playwright against Axum + Dioxus (headless, no reuseExistingServer).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev}"
export JWT_SECRET="${JWT_SECRET:-geosyntra-ci-jwt-secret}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-$JWT_SECRET}"
export GEOSYNTRA_API_PORT="${GEOSYNTRA_API_PORT:-3003}"
export APP_ORIGIN="${APP_ORIGIN:-http://127.0.0.1:8080}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://127.0.0.1:8080}"
export GEOSYNTRA_WEB_URL="${GEOSYNTRA_WEB_URL:-http://127.0.0.1:8080}"
export GEOSYNTRA_API_URL="${GEOSYNTRA_API_URL:-http://127.0.0.1:3003}"
unset GEOSYNTRA_WEB_API_BASE

API_PID=""
DX_PID=""

cleanup() {
  [[ -n "$DX_PID" ]] && kill "$DX_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Postgres"
bash scripts/dev-postgres.sh start

echo "==> Axum API (:${GEOSYNTRA_API_PORT})"
cargo run -p geosyntra-api &
API_PID=$!

for _ in $(seq 1 120); do
  curl -sf "http://127.0.0.1:${GEOSYNTRA_API_PORT}/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:${GEOSYNTRA_API_PORT}/health" | grep -qx ok

echo "==> Dioxus web (:8080)"
if ! command -v dx >/dev/null 2>&1; then
  echo "ci-dioxus-e2e: missing dx — install: cargo install dioxus-cli --version 0.7.9" >&2
  exit 1
fi

cd packages/web
rsync -a --delete "${ROOT}/packages/web/assets/" "${ROOT}/packages/web/public/assets/"
dx serve --platform web --open false --port 8080 &
DX_PID=$!
cd "$ROOT"

for _ in $(seq 1 180); do
  curl -sf "${GEOSYNTRA_WEB_URL}/" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "${GEOSYNTRA_WEB_URL}/" >/dev/null

echo "==> Playwright E2E"
bash scripts/run-dioxus-playwright.sh

echo "ci-dioxus-e2e: OK"
