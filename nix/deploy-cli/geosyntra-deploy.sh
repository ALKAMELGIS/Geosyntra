#!/usr/bin/env bash
# geosyntra-deploy — unified Hostinger deploy CLI (local install via Nix).
set -euo pipefail

CLI_VERSION="0.1.0"
CLI_LIB="${GEOSYNTRA_DEPLOY_LIB:-@out@/lib/geosyntra-deploy}"
CLI_COMMANDS="${CLI_LIB}/commands"

# shellcheck source=lib/common.sh
source "${CLI_LIB}/lib/common.sh"
# shellcheck source=lib/help.sh
source "${CLI_LIB}/lib/help.sh"

parse_globals() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -H|--host) GLOBAL_HOST="$2"; shift 2 ;;
      -u|--user) GLOBAL_USER="$2"; shift 2 ;;
      -p|--port) GLOBAL_PORT="$2"; shift 2 ;;
      -R|--repo) REPO_ROOT="$2"; shift 2 ;;
      --dry-run) DRY_RUN=1; shift ;;
      -h|--help) print_help ""; exit 0 ;;
      -V|--version) echo "geosyntra-deploy ${CLI_VERSION}"; exit 0 ;;
      -*) echo "Unknown option: $1" >&2; print_help ""; exit 2 ;;
      *) break ;;
    esac
  done
  apply_global_host
}

main() {
  parse_globals "$@"
  [[ $# -gt 0 ]] || { print_help ""; exit 2; }

  case "${1:-}" in
    express)
      shift
      # shellcheck source=commands/express.sh
      source "${CLI_COMMANDS}/express.sh"
      cmd_express "$@"
      ;;
    axum)
      shift
      case "${1:-}" in
        staging)
          shift
          source "${CLI_COMMANDS}/axum-staging.sh"
          cmd_axum_staging "$@"
          ;;
        *)
          print_help axum
          exit 2
          ;;
      esac
      ;;
    dioxus)
      shift
      case "${1:-}" in
        staging)
          shift
          source "${CLI_COMMANDS}/dioxus-staging.sh"
          cmd_dioxus_staging "$@"
          ;;
        *)
          print_help dioxus
          exit 2
          ;;
      esac
      ;;
    staging)
      shift
      source "${CLI_COMMANDS}/staging-all.sh"
      cmd_staging_all "$@"
      ;;
    smoke)
      shift
      case "${1:-}" in
        dioxus)
          shift
          source "${CLI_COMMANDS}/smoke-dioxus.sh"
          cmd_smoke_dioxus "$@"
          ;;
        *)
          print_help smoke
          exit 2
          ;;
      esac
      ;;
    backup)
      shift
      source "${CLI_COMMANDS}/backup.sh"
      case "${1:-}" in
        pull) shift; cmd_backup_pull "$@" ;;
        restore) shift; cmd_backup_restore "$@" ;;
        list) shift; cmd_backup_list "$@" ;;
        *) print_help backup; exit 2 ;;
      esac
      ;;
    production)
      shift
      source "${CLI_COMMANDS}/production.sh"
      cmd_production "$@"
      ;;
    nixos)
      shift
      source "${CLI_COMMANDS}/nixos.sh"
      case "${1:-}" in
        install) shift; cmd_nixos_install "$@" ;;
        switch) shift; cmd_nixos_switch "$@" ;;
        *) print_help nixos; exit 2 ;;
      esac
      ;;
    help)
      shift
      print_help "${1:-}"
      ;;
    *)
      echo "Unknown command: $1" >&2
      print_help ""
      exit 2
      ;;
  esac
}

main "$@"
