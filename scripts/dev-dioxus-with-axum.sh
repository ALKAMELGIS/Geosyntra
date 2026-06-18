#!/usr/bin/env bash
# Task 20.3 — Axum API (:3003) + Dioxus fullstack dev server (:8080, proxies /api).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev}"
export JWT_SECRET="${JWT_SECRET:-geosyntra-dev-jwt-secret-change-me}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-$JWT_SECRET}"
export GEOSYNTRA_API_PORT="${GEOSYNTRA_API_PORT:-3003}"
export APP_ORIGIN="${APP_ORIGIN:-http://127.0.0.1:8080}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:8080,http://127.0.0.1:8080}"
# SSR/server-side API calls use Axum directly; wasm client uses same-origin /api via dx proxy.
unset GEOSYNTRA_WEB_API_BASE

echo "==> Postgres"
bash scripts/dev-postgres.sh start

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Axum API on http://127.0.0.1:${GEOSYNTRA_API_PORT}"
cargo run -p geosyntra-api &
API_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${GEOSYNTRA_API_PORT}/health" >/dev/null 2>&1; then
    echo "Axum ready"
    break
  fi
  sleep 0.5
done

if ! curl -sf "http://127.0.0.1:${GEOSYNTRA_API_PORT}/health" >/dev/null 2>&1; then
  echo "Axum failed to start" >&2
  exit 1
fi

echo "==> Dioxus fullstack on http://127.0.0.1:8080 — /api proxied to Axum"
echo "    Login: admin@geosyntra.com / GeoSyntra-Admin-2026!"

if command -v dx >/dev/null 2>&1; then
  cd packages/web
  # dx serve reads asset_dir=public; keep CSS/wasm-adjacent assets in sync.
  rsync -a --delete "${ROOT}/packages/web/assets/" "${ROOT}/packages/web/public/assets/"
  exec dx serve --platform web --open false --port 8080
else
  echo "Install dx: cargo install dioxus-cli --version 0.7.9" >&2
  PUBLIC_DIR="${ROOT}/target/debug/public"
  mkdir -p "${PUBLIC_DIR}"
  rsync -a --delete "${ROOT}/packages/web/public/" "${PUBLIC_DIR}/"
  rsync -a --delete "${ROOT}/packages/web/assets/" "${PUBLIC_DIR}/assets/"
  exec cargo run -p geosyntra-web --features server
fi
