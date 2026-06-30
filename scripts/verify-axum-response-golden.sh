#!/usr/bin/env bash
# Verify Axum HTTP responses against migration/axum-response-golden.tsv
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL=postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev
fi

scripts/dev-postgres.sh start >/dev/null

echo "==> Running Axum response golden tests"
cargo test -p geosyntra-api --test response_golden -- --ignored --nocapture
