# shellcheck shell=bash
cmd_production() {
  resolve_repo_root
  require_host
  cd "$REPO_ROOT"
  echo "Deploy React + Express from current branch (use main for production UI/API)."
  run_cmd node scripts/vps-deploy-production.mjs "$@"
}
