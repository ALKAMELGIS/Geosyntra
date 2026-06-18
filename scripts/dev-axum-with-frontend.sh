#!/usr/bin/env bash
# Local dev: React (Vite :5173) + Axum API (:3003) — no Express.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev}"
export JWT_SECRET="${JWT_SECRET:-geosyntra-dev-jwt-secret-change-me}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-$JWT_SECRET}"
export GEOSYNTRA_API_PORT="${GEOSYNTRA_API_PORT:-3003}"
export VITE_DEV_API_PROXY="${VITE_DEV_API_PROXY:-http://127.0.0.1:${GEOSYNTRA_API_PORT}}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:${GEOSYNTRA_API_PORT}}"

echo "==> Postgres"
bash scripts/dev-postgres.sh start

echo "==> Bootstrap RBAC matrix (if needed)"
if command -v cargo >/dev/null 2>&1; then
  cargo run --example bootstrap -p infrastructure 2>/dev/null || true
fi

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Axum API on http://127.0.0.1:${GEOSYNTRA_API_PORT}"
echo "    First run creates admin@geosyntra.com + super@geosyntra.com (password: GeoSyntra-Admin-2026!)"
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
  echo "Axum failed to start — check DATABASE_URL and cargo build" >&2
  exit 1
fi

echo "==> React (Vite) on http://127.0.0.1:5173 — proxy /api -> ${VITE_DEV_API_PROXY}"
cd frontend
if [[ ! -d node_modules ]]; then
  echo "Installing frontend dependencies..."
  npm install
fi
exec npm run dev:client:clean
