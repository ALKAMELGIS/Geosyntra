#!/usr/bin/env bash
# Task 25 — Playwright E2E against Dioxus fullstack (requires dx :8080 + Axum :3003).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E="${ROOT}/e2e/dioxus"
WEB_URL="${GEOSYNTRA_WEB_URL:-http://127.0.0.1:8080}"
API_URL="${GEOSYNTRA_API_URL:-http://127.0.0.1:3003}"

if ! curl -sf "${WEB_URL}/" >/dev/null 2>&1; then
  echo "Dioxus web not reachable at ${WEB_URL}" >&2
  echo "Start: bash scripts/dev-dioxus-with-axum.sh" >&2
  exit 1
fi

if ! curl -sf "${API_URL}/health" | grep -qx 'ok' 2>/dev/null; then
  echo "Axum API not reachable at ${API_URL}" >&2
  exit 1
fi

cd "$E2E"
if [[ ! -d node_modules/playwright ]]; then
  echo "==> Installing Playwright (e2e/dioxus)"
  npm install --no-audit --no-fund
  npx playwright install chromium
fi

export GEOSYNTRA_WEB_URL="$WEB_URL"
echo "==> Playwright E2E (${WEB_URL})"

if [[ "${UI:-}" == "1" ]]; then
  echo "    Mode: Playwright UI (interactive)"
  npm run test:ui -- "$@"
elif [[ "${HEADED:-}" == "1" ]]; then
  echo "    Mode: headed browser (visible, 1 worker)"
  npm run test:headed -- "$@"
else
  npm test -- "$@"
fi
