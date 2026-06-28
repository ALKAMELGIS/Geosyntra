# shellcheck shell=bash
# Read-only pull from Ubuntu VPS before nixos-anywhere.

cmd_backup_pull() {
  resolve_repo_root
  cd "$REPO_ROOT"
  run_cmd bash scripts/vps-backup-pull.sh "$@"
}

cmd_backup_restore() {
  resolve_repo_root
  cd "$REPO_ROOT"
  run_cmd bash scripts/vps-backup-restore-nixos.sh "$@"
}

cmd_backup_list() {
  backup_root_default
  echo "Backups under: ${BACKUP_ROOT}"
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    echo "(empty — run: geosyntra-deploy backup pull)"
    return 0
  fi
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) | sort -r
}
