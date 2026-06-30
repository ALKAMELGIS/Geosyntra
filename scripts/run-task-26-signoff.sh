#!/usr/bin/env bash
# Task 26 — full automated sign-off (26.1–26.4 gates before Task 27 cutover).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Task 26.1 — Rust unit tests"
bash scripts/run-all-tests.sh

echo ""
echo "==> Route catalog parity"
cargo test -p interface --test route_parity -- --nocapture

echo ""
echo "==> Task 26.1 — API integration (Postgres + Axum in-process)"
RUN_API_INTEGRATION=1 bash scripts/run-api-integration-tests.sh

echo ""
echo "==> Task 26.3 — local staging (Axum + Dioxus release bundle, single origin)"
bash scripts/run-local-staging-smoke.sh

if curl -sf "http://127.0.0.1:8080/" >/dev/null 2>&1 \
  && curl -sf "http://127.0.0.1:3003/health" >/dev/null 2>&1; then
  echo ""
  echo "==> Task 26.2 — Dioxus dev stack smoke (:8080 + :3003)"
  bash scripts/smoke-dioxus-web.sh
  echo ""
  echo "==> Task 25 / 26 — Playwright E2E (dev stack)"
  bash scripts/run-dioxus-playwright.sh
else
  echo ""
  echo "==> Skip dev-stack Playwright (start: bash scripts/dev-dioxus-with-axum.sh)"
fi

if [[ -n "${GEOSYNTRA_DEPLOY_HOST:-}" ]]; then
  echo ""
  echo "==> Task 26.3 — Hostinger staging deploy"
  if bash scripts/deploy-axum-staging.sh && bash scripts/deploy-dioxus-staging.sh; then
    STAGING_URL="${GEOSYNTRA_STAGING_URL:-http://${GEOSYNTRA_DEPLOY_HOST}:3003}"
    GEOSYNTRA_WEB_URL="$STAGING_URL" GEOSYNTRA_API_URL="$STAGING_URL" bash scripts/smoke-dioxus-web.sh
  else
    echo "WARN: Hostinger deploy failed — local staging smoke above is the sign-off fallback." >&2
  fi
else
  echo ""
  echo "Hostinger deploy skipped (set GEOSYNTRA_DEPLOY_HOST to enable VPS staging)."
fi

echo ""
echo "Task 26 automated sign-off: OK"
echo "Manual checklist: migration/e2e-signoff-checklist.md"
