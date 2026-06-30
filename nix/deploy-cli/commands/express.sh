# shellcheck shell=bash
cmd_express() {
  resolve_repo_root
  require_host
  cd "$REPO_ROOT"
  local extra=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-only) extra+=(--env) ;;
      --no-install) extra+=(--no-install) ;;
      *) echo "Unknown express flag: $1" >&2; exit 2 ;;
    esac
    shift
  done
  if [[ ! -f "${REPO_ROOT}/hostinger.secrets.env" ]]; then
    echo "WARN: hostinger.secrets.env missing — copy from hostinger.secrets.env.example" >&2
  fi
  run_cmd npm run vps:deploy -- "${extra[@]}"
}
