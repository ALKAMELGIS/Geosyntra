#!/usr/bin/env bash
# Run all Rust tests for GeoSyntra (Task workflow — must pass before commit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> cargo test workspace (unit + integration)"
cargo test --workspace --exclude geosyntra-web 2>&1
echo "==> geosyntra-web unit tests"
cargo test -p geosyntra-web --lib 2>&1

if [[ -n "${REDIS_URL:-}" ]]; then
  echo "==> Redis integration (REDIS_URL set)"
  cargo test -p infrastructure --test redis_auth_cache 2>&1
else
  echo "==> skip Redis integration (set REDIS_URL to enable)"
fi

if [[ "${RUN_API_INTEGRATION:-}" == "1" ]]; then
  bash scripts/run-api-integration-tests.sh
else
  echo "==> skip API integration (RUN_API_INTEGRATION=1 to enable)"
fi

echo "==> all requested tests passed"
