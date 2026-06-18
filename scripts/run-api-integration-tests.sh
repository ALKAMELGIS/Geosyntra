#!/usr/bin/env bash
# Run Axum HTTP integration tests against local Postgres (reqwest + dummy seed data).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev}"
export JWT_SECRET="${JWT_SECRET:-geosyntra-integration-test-secret}"
export RBAC_JWT_SECRET="${RBAC_JWT_SECRET:-geosyntra-integration-test-secret}"

echo "==> Starting local Postgres (if needed)"
bash scripts/dev-postgres.sh start

echo "==> Running API integration tests"
# Suites share one Axum server + Postgres pool; run serially to avoid pool contention.
cargo test -p geosyntra-api --test api_integration -- --ignored --test-threads=1 "$@"

echo "==> Running Axum response golden tests"
cargo test -p geosyntra-api --test response_golden -- --ignored --test-threads=1 "$@"
