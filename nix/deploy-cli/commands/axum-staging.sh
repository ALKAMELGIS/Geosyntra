# shellcheck shell=bash
cmd_axum_staging() {
  resolve_repo_root
  require_host
  cd "$REPO_ROOT"
  echo "==> Building geosyntra-api"
  run_cmd nix build .#geosyntra-api --no-link
  echo "==> Deploying Axum staging only (:3003 — app subdomain, NOT api production)"
  run_cmd nix run .#deploy -- .#hostinger-vps.profiles.geosyntra-api-staging --skip-checks
  cat <<EOF

Staging Axum deployed. On VPS:
  /etc/geosyntra/api-staging.env
  systemctl status geosyntra-api-staging
  curl http://127.0.0.1:3003/health

Target DATABASE_URL namespace: geosyntra_axum
EOF
}
