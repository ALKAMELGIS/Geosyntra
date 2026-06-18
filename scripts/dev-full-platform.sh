#!/usr/bin/env bash
# Dioxus (:8080) + legacy React GIS map (:5173) + Axum API (:3003).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev}"
export JWT_SECRET="${JWT_SECRET:-geosyntra-dev-jwt-secret-change-me}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-$JWT_SECRET}"
export GEOSYNTRA_API_PORT="${GEOSYNTRA_API_PORT:-3003}"
export APP_ORIGIN="${APP_ORIGIN:-http://127.0.0.1:8080}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173}"
export VITE_DEV_API_PROXY="${VITE_DEV_API_PROXY:-http://127.0.0.1:${GEOSYNTRA_API_PORT}}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:${GEOSYNTRA_API_PORT}}"

echo "==> Postgres"
bash scripts/dev-postgres.sh start

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${VITE_PID:-}" ]] && kill "$VITE_PID" 2>/dev/null || true
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

echo "==> React GIS (Vite) on http://127.0.0.1:5173"
cd frontend
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run dev:client:clean &
VITE_PID=$!
cd "$ROOT"

sleep 2

echo "==> Dioxus fullstack on http://127.0.0.1:8080"
echo "    Login: admin@geosyntra.com / GeoSyntra-Admin-2026!"
echo "    After sign-in, click Start → /satellite (map iframe loads from :5173)"

if command -v dx >/dev/null 2>&1; then
  cd packages/web
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
