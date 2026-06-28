#!/usr/bin/env bash
# Task 24.3 — rsync Dioxus web bundle to Hostinger staging (:3003) and restart Axum staging.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if command -v geosyntra-deploy >/dev/null 2>&1; then
  exec geosyntra-deploy dioxus staging "$@"
fi

cd "$ROOT"
HOST="${GEOSYNTRA_DEPLOY_HOST:-}"
USER="${GEOSYNTRA_DEPLOY_USER:-root}"
PORT="${GEOSYNTRA_DEPLOY_PORT:-22}"
REMOTE_WEB="${GEOSYNTRA_STAGING_WEB_DIR:-/var/lib/geosyntra-api-staging/web/public}"

if [[ -z "$HOST" ]]; then
  echo "Set GEOSYNTRA_DEPLOY_HOST (VPS IP or api.geosyntra.org)" >&2
  exit 1
fi

DIST="${GEOSYNTRA_WEB_DIST:-${ROOT}/target/dx/geosyntra-web/release/web/public}"
if [[ ! -f "${DIST}/index.html" ]]; then
  echo "==> Building Dioxus web release bundle"
  bash scripts/build-dioxus-web.sh
  DIST="${ROOT}/target/dx/geosyntra-web/release/web/public"
fi

SSH=(ssh -p "$PORT" "${USER}@${HOST}")
RSYNC=(rsync -az --delete -e "ssh -p ${PORT}")

echo "==> Sync web bundle to ${USER}@${HOST}:${REMOTE_WEB}"
"${SSH[@]}" "mkdir -p '${REMOTE_WEB}'"
"${RSYNC[@]}" "${DIST}/" "${USER}@${HOST}:${REMOTE_WEB}/"

echo "==> Ensure GEOSYNTRA_WEB_DIST in api-staging.env"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
ENV=/etc/geosyntra/api-staging.env
touch "\$ENV"
if grep -q '^GEOSYNTRA_WEB_DIST=' "\$ENV" 2>/dev/null; then
  sed -i "s|^GEOSYNTRA_WEB_DIST=.*|GEOSYNTRA_WEB_DIST=${REMOTE_WEB}|" "\$ENV"
else
  echo "GEOSYNTRA_WEB_DIST=${REMOTE_WEB}" >> "\$ENV"
fi
systemctl restart geosyntra-api-staging
REMOTE

STAGING_URL="${GEOSYNTRA_STAGING_URL:-http://${HOST}:3003}"
echo ""
echo "Staging web + API: ${STAGING_URL}"
echo "Smoke:"
echo "  GEOSYNTRA_WEB_URL=${STAGING_URL} GEOSYNTRA_API_URL=${STAGING_URL} bash scripts/smoke-dioxus-web.sh"
