#!/usr/bin/env bash
# Run Postgres migrations + RBAC MATRIX seed (requires DATABASE_URL / direnv).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Run: direnv allow" >&2
  exit 1
fi

cargo run --example bootstrap -p infrastructure
