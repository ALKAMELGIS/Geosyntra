#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if command -v geosyntra-deploy >/dev/null 2>&1; then
  exec geosyntra-deploy axum staging "$@"
fi
cd "$ROOT"
[[ -n "${GEOSYNTRA_DEPLOY_HOST:-}" ]] || { echo "Set GEOSYNTRA_DEPLOY_HOST" >&2; exit 1; }
nix build .#geosyntra-api --no-link
nix run .#deploy -- .#hostinger-vps.profiles.geosyntra-api-staging --skip-checks
