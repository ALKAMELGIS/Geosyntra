#!/usr/bin/env bash
# Task 26 — run API integration tests + Dioxus web smoke + Playwright (stack must be up).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> API integration (Postgres + Axum in-process)"
bash scripts/run-api-integration-tests.sh

echo ""
echo "==> Dioxus web smoke (requires dx serve :8080 + geosyntra-api :3003)"
if curl -sf "http://127.0.0.1:8080/" >/dev/null 2>&1 \
  && curl -sf "http://127.0.0.1:3003/health" >/dev/null 2>&1; then
  bash scripts/smoke-dioxus-web.sh
  echo ""
  echo "==> Playwright E2E (Task 25)"
  bash scripts/run-dioxus-playwright.sh
else
  echo "Skip: start dev stack first — bash scripts/dev-dioxus-with-axum.sh" >&2
  exit 1
fi

echo ""
echo "E2E smoke complete. See migration/e2e-signoff-checklist.md for manual sign-off."
