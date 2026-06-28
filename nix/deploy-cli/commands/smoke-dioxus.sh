# shellcheck shell=bash
cmd_smoke_dioxus() {
  resolve_repo_root
  local web_url="" api_url=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --web-url) web_url="$2"; shift 2 ;;
      --api-url) api_url="$2"; shift 2 ;;
      *) echo "Unknown smoke flag: $1" >&2; exit 2 ;;
    esac
  done
  apply_global_host
  if [[ -z "$web_url" ]]; then
    if [[ -n "${GEOSYNTRA_DEPLOY_HOST:-}" ]]; then
      web_url="http://${GEOSYNTRA_DEPLOY_HOST}:3003"
    else
      web_url="https://app.geosyntra.org"
    fi
  fi
  api_url="${api_url:-$web_url}"
  cd "$REPO_ROOT"
  run_cmd env GEOSYNTRA_WEB_URL="$web_url" GEOSYNTRA_API_URL="$api_url" bash scripts/smoke-dioxus-web.sh
}
