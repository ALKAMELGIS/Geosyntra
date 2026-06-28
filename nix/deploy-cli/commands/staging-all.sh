# shellcheck shell=bash
cmd_staging_all() {
  # shellcheck disable=SC1091
  source "${CLI_COMMANDS}/axum-staging.sh"
  cmd_axum_staging
  # shellcheck disable=SC1091
  source "${CLI_COMMANDS}/dioxus-staging.sh"
  cmd_dioxus_staging --skip-build
  echo ""
  echo "Rust preview stack deployed. Smoke:"
  echo "  geosyntra-deploy smoke dioxus --web-url https://app.geosyntra.org --api-url https://app.geosyntra.org"
}
