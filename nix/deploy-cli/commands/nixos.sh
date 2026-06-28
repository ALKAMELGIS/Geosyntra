# shellcheck shell=bash
cmd_nixos_install() {
  resolve_repo_root
  require_host
  local confirm=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --confirm) confirm=1 ;;
      *) echo "Unknown nixos install flag: $1" >&2; exit 2 ;;
    esac
    shift
  done
  if [[ "$confirm" -ne 1 ]]; then
    echo "nixos-anywhere WIPES the VPS disk." >&2
    echo "Run: geosyntra-deploy backup pull" >&2
    echo "Then: geosyntra-deploy nixos install --confirm" >&2
    exit 2
  fi
  backup_root_default
  if [[ ! -d "${BACKUP_ROOT}/latest" ]]; then
    echo "ERROR: no backup at ${BACKUP_ROOT}/latest — run backup pull first" >&2
    exit 2
  fi
  cd "$REPO_ROOT"
  run_cmd bash scripts/install-nixos-hostinger.sh
}

cmd_nixos_switch() {
  resolve_repo_root
  require_host
  cd "$REPO_ROOT"
  run_cmd bash scripts/deploy-nixos-hostinger.sh
}
