# shellcheck shell=bash
print_help() {
  local topic="${1:-}"
  case "$topic" in
    ""|help)
      cat <<'EOF'
geosyntra-deploy — GeoSyntra Hostinger VPS deploy CLI

Production policy: Express+React on www/api; Dioxus+Axum on app subdomain only.

Usage:
  geosyntra-deploy [GLOBAL_OPTS] COMMAND [ARGS]

Global options:
  -H, --host HOST       VPS hostname or IP (GEOSYNTRA_DEPLOY_HOST)
  -u, --user USER       SSH user (default: root)
  -p, --port PORT       SSH port (default: 22)
  -R, --repo PATH       Geosyntra repo root
      --dry-run         Print commands without executing
  -h, --help            Show help
  -V, --version         Show version

Commands:
  production [--env-only] [--no-install]  React (www) + Express (api) — main branch
  express [--env-only] [--no-install]   Deploy Express API to :3001 (main production)
  axum staging                        deploy-rs Axum → :3003 (app subdomain only)
  dioxus staging [--skip-build]       Rsync Dioxus bundle to staging web dir
  staging                             axum staging + dioxus staging
  smoke dioxus [--web-url U] [--api-url U]
  backup pull                         Pull env + DB + data from Ubuntu VPS (read-only)
  backup restore [--dir PATH]         Restore latest pull into local staging area
  backup list                         List local VPS backup snapshots
  nixos install --confirm             nixos-anywhere (DESTRUCTIVE — requires --confirm)
  nixos switch                        nixos-rebuild switch (future NixOS host)
  help [COMMAND]                      Command-specific help

Install locally:
  nix profile install .#geosyntra-deploy

Examples:
  geosyntra-deploy -H 46.202.183.152 backup pull
  geosyntra-deploy staging
  geosyntra-deploy smoke dioxus --web-url https://app.geosyntra.org --api-url https://app.geosyntra.org
EOF
      ;;
    express)
      cat <<'EOF'
geosyntra-deploy express — main production Express API (:3001)

Wraps: npm run vps:deploy

Flags:
  --env-only       Refresh remote .env only (no code tarball)
  --no-install     Skip npm install on VPS

Requires: hostinger.secrets.env with VPS_HOST / VPS_ROOT_PASS or SSH key auth.
Does NOT deploy Axum to api.geosyntra.org.
EOF
      ;;
    axum)
      cat <<'EOF'
geosyntra-deploy axum — Rust Axum via deploy-rs

Subcommands:
  staging    Profile geosyntra-api-staging on port 3003 (app.geosyntra.org)

Never use production deploy-rs profile on api.geosyntra.org until cutover.
EOF
      ;;
    dioxus)
      cat <<'EOF'
geosyntra-deploy dioxus — Dioxus web bundle

Subcommands:
  staging [--skip-build]   Build dx release + rsync to /var/lib/geosyntra-api-staging/web/public

Served by Axum on app subdomain when GEOSYNTRA_WEB_DIST is set in api-staging.env.
EOF
      ;;
    staging)
      cat <<'EOF'
geosyntra-deploy staging — deploy Rust preview stack only

Runs: axum staging && dioxus staging

Does not touch Express production on :3001.
EOF
      ;;
    smoke)
      cat <<'EOF'
geosyntra-deploy smoke dioxus — HTTP smoke for Dioxus + Axum

Flags:
  --web-url URL   Default: http://HOST:3003 or https://app.geosyntra.org
  --api-url URL   Default: same as web-url (same-origin)
EOF
      ;;
    backup)
      cat <<'EOF'
geosyntra-deploy backup — Ubuntu VPS snapshot before nixos-anywhere

Subcommands:
  pull     SSH read-only: /etc/geosyntra/*.env, data dir, sqlite, optional pg_dump
  restore  Prepare restore manifest for post-NixOS install (local only)
  list     List backup timestamps under migration/vps-backup/

Run `backup pull` BEFORE nixos-anywhere. Backups are gitignored locally.

Database namespaces on NixOS (target):
  geosyntra_express  — Express production
  geosyntra_axum     — Axum preview (app subdomain)
EOF
      ;;
    nixos)
      cat <<'EOF'
geosyntra-deploy nixos — full NixOS host (Track B)

Subcommands:
  install --confirm   Wipe VPS disk via nixos-anywhere (requires backup pull first)
  switch              nixos-rebuild switch --flake .#hostinger-vps

Always run `backup pull` before `nixos install --confirm`.
EOF
      ;;
    *)
      echo "Unknown help topic: $topic" >&2
      print_help ""
      exit 2
      ;;
  esac
}
