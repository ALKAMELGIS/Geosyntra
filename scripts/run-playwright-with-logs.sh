#!/usr/bin/env bash
# Cold-restart Axum + Dioxus, tail logs, run Playwright (Task 33 commit-test cycle).
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
export JWT_SECRET="${JWT_SECRET:-geosyntra-dev-jwt-secret-change-me}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-$JWT_SECRET}"
export MAPBOX_DEV_REFERER="${MAPBOX_DEV_REFERER:-https://www.geosyntra.org}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173}"
export GEOSYNTRA_REACT_GIS_URL="${GEOSYNTRA_REACT_GIS_URL:-http://127.0.0.1:5173/Geosyntra/#/satellite/indices?embed=1}"
API_LOG="${GEOSYNTRA_API_LOG:-/tmp/geosyntra-api.log}"
DX_LOG="${GEOSYNTRA_DX_LOG:-/tmp/dx-serve.log}"

echo "==> Cold restart: stop existing Axum / dx serve"
pkill -f 'target/debug/geosyntra-api|geosyntra-api' 2>/dev/null || true
pkill -f 'dx serve.*8080' 2>/dev/null || true
sleep 2

echo "==> Start Axum on :3003 (log: ${API_LOG})"
: > "${API_LOG}"
(
  cd packages/api
  export DATABASE_URL JWT_SECRET PORT=3003
  export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-10000}"
  nohup cargo run --bin geosyntra-api >> "${API_LOG}" 2>&1 &
)
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3003/health | grep -qx ok 2>/dev/null; then
    echo "Axum ready"
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:3003/health | grep -qx ok || {
  echo "Axum failed — last lines of ${API_LOG}:" >&2
  tail -30 "${API_LOG}" >&2
  exit 1
}

echo "==> React GIS (Vite) on :5173 — skipped (native Dioxus GIS; set GEOSYNTRA_START_VITE=1 to enable)"
if [[ "${GEOSYNTRA_START_VITE:-0}" == "1" ]]; then
VITE_LOG="${GEOSYNTRA_VITE_LOG:-/tmp/geosyntra-vite.log}"
: > "${VITE_LOG}"
(
  cd frontend
  if [[ ! -d node_modules ]]; then npm install; fi
  nohup npm run dev:client:clean >> "${VITE_LOG}" 2>&1 &
)
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; then
    echo "Vite ready"
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:5173/ >/dev/null || {
  echo "Vite failed — last lines of ${VITE_LOG}:" >&2
  tail -30 "${VITE_LOG}" >&2
  exit 1
}
fi

echo "==> Start Dioxus on :8080 (log: ${DX_LOG})"
: > "${DX_LOG}"
(
  cd packages/web
  export DATABASE_URL JWT_SECRET
  rsync -a --delete "${ROOT}/packages/web/assets/" "${ROOT}/packages/web/public/assets/" 2>/dev/null || true
  nohup dx serve --platform web --open false --port 8080 >> "${DX_LOG}" 2>&1 &
)
for _ in $(seq 1 120); do
  if curl -sf http://127.0.0.1:8080/ >/dev/null 2>&1; then
    if rg -q "Build completed successfully|Build failed" "${DX_LOG}" 2>/dev/null; then
      if rg -q "Build failed" "${DX_LOG}" 2>/dev/null; then
        echo "Dioxus build failed — see ${DX_LOG}" >&2
        tail -40 "${DX_LOG}" >&2
        exit 1
      fi
      echo "Dioxus ready"
      break
    fi
  fi
  sleep 2
done
curl -sf http://127.0.0.1:8080/ >/dev/null || {
  echo "Dioxus failed — last lines of ${DX_LOG}:" >&2
  tail -40 "${DX_LOG}" >&2
  exit 1
}

echo "==> Tailing logs (background) during Playwright"
tail -f "${API_LOG}" "${DX_LOG}" > /tmp/geosyntra-playwright-combined.log 2>&1 &
TAIL_PID=$!
cleanup() {
  kill "${TAIL_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Playwright (--workers=1)"
cd e2e/dioxus
export GEOSYNTRA_WEB_URL="${GEOSYNTRA_WEB_URL:-http://127.0.0.1:8080}"
PW_EXIT=0
npx playwright test --workers=1 "$@" || PW_EXIT=$?

echo "==> Log scan for errors"
rg -n "ERROR|panic|Build failed|500 Internal" "${API_LOG}" "${DX_LOG}" 2>/dev/null | tail -20 || true

if [[ "${PW_EXIT}" -ne 0 ]]; then
  echo "Playwright failed — inspect ${API_LOG} and ${DX_LOG}" >&2
  exit "${PW_EXIT}"
fi
echo "Playwright passed"
