# shellcheck shell=bash
# Shared helpers for geosyntra-deploy.

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
REPO_ROOT="${REPO_ROOT:-}"
GLOBAL_HOST="${GEOSYNTRA_DEPLOY_HOST:-}"
GLOBAL_USER="${GEOSYNTRA_DEPLOY_USER:-root}"
GLOBAL_PORT="${GEOSYNTRA_DEPLOY_PORT:-22}"
BACKUP_ROOT="${GEOSYNTRA_BACKUP_ROOT:-}"

resolve_repo_root() {
  if [[ -n "$REPO_ROOT" && -f "${REPO_ROOT}/flake.nix" ]]; then
    return 0
  fi
  if [[ -n "${GEOSYNTRA_REPO:-}" && -f "${GEOSYNTRA_REPO}/flake.nix" ]]; then
    REPO_ROOT="$GEOSYNTRA_REPO"
    export REPO_ROOT
    return 0
  fi
  if command -v git >/dev/null 2>&1; then
    local top
    top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ -n "$top" && -f "${top}/flake.nix" ]]; then
      REPO_ROOT="$top"
      export REPO_ROOT
      return 0
    fi
  fi
  echo "geosyntra-deploy: cannot find repo root (use --repo or run inside Geosyntra git tree)" >&2
  exit 2
}

apply_global_host() {
  if [[ -n "$GLOBAL_HOST" ]]; then
    export GEOSYNTRA_DEPLOY_HOST="$GLOBAL_HOST"
  fi
  export GEOSYNTRA_DEPLOY_USER="$GLOBAL_USER"
  export GEOSYNTRA_DEPLOY_PORT="$GLOBAL_PORT"
}

require_host() {
  apply_global_host
  if [[ -z "${GEOSYNTRA_DEPLOY_HOST:-}" ]]; then
    echo "geosyntra-deploy: set --host or GEOSYNTRA_DEPLOY_HOST" >&2
    exit 2
  fi
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

backup_root_default() {
  resolve_repo_root
  BACKUP_ROOT="${BACKUP_ROOT:-${REPO_ROOT}/migration/vps-backup}"
  export BACKUP_ROOT
}

latest_backup_dir() {
  backup_root_default
  local latest="${BACKUP_ROOT}/latest"
  if [[ -L "$latest" && -d "$latest" ]]; then
    readlink -f "$latest"
    return 0
  fi
  local newest
  newest="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r | head -1 || true)"
  if [[ -n "$newest" ]]; then
    echo "$newest"
    return 0
  fi
  echo "geosyntra-deploy: no backup found under ${BACKUP_ROOT}" >&2
  exit 2
}
