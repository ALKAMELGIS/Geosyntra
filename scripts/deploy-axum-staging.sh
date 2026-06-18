#!/usr/bin/env bash
# Deploy Axum staging API to Hostinger VPS on :3003 (Express stays on :3001).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${GEOSYNTRA_DEPLOY_HOST:-}" ]]; then
  echo "Set GEOSYNTRA_DEPLOY_HOST (VPS IP or api.geosyntra.org)" >&2
  exit 1
fi

echo "==> Building geosyntra-api"
nix build .#geosyntra-api --no-link

echo "==> Deploying staging profile (geosyntra-api-staging → :3003)"
nix run .#deploy -- .#hostinger-vps.profiles.geosyntra-api-staging --skip-checks

cat <<EOF

Staging deployed. On the VPS:
  sudo nano /etc/geosyntra/api-staging.env   # DATABASE_URL, JWT_SECRET, …
  sudo systemctl restart geosyntra-api-staging
  sudo journalctl -u geosyntra-api-staging -f

Health: curl http://127.0.0.1:3003/health
Compare: EXPRESS_URL=http://127.0.0.1:3001 AXUM_URL=http://127.0.0.1:3003 scripts/compare-api-parity.sh

Dioxus web (Task 24.3): scripts/deploy-dioxus-staging.sh
EOF
