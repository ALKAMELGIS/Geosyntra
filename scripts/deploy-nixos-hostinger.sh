#!/usr/bin/env bash
# nixos-rebuild switch to Hostinger NixOS host (after nixos-anywhere).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${GEOSYNTRA_DEPLOY_HOST:?Set GEOSYNTRA_DEPLOY_HOST}"

exec nixos-rebuild switch \
  --flake ".#hostinger-vps" \
  --target-host "root@${HOST}" \
  --build-host localhost \
  --use-remote-sudo
