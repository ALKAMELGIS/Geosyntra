# shellcheck shell=bash
cmd_dioxus_staging() {
  resolve_repo_root
  require_host
  cd "$REPO_ROOT"
  local skip_build=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-build) skip_build=1 ;;
      *) echo "Unknown dioxus flag: $1" >&2; exit 2 ;;
    esac
    shift
  done
  if [[ "$skip_build" -eq 0 ]]; then
    run_cmd bash scripts/build-dioxus-web.sh
  fi
  run_cmd bash scripts/deploy-dioxus-staging.sh
}
