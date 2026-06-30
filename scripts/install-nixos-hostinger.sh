#!/usr/bin/env bash
# nixos-anywhere initial install — DESTRUCTIVE. Requires backup pull + --confirm via geosyntra-deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${GEOSYNTRA_DEPLOY_HOST:?Set GEOSYNTRA_DEPLOY_HOST}"
HW="${ROOT}/nix/nixos/hostinger-vps/hardware.nix"

if [[ ! -f "$HW" ]]; then
  echo "hardware.nix will be generated on first install"
fi

echo "WARNING: This will wipe ${HOST} and install NixOS."
echo "Ensure: geosyntra-deploy backup pull completed."

exec nix run github:nix-community/nixos-anywhere -- \
  --flake ".#hostinger-vps" \
  --target-host "root@${HOST}" \
  --generate-hardware-config nix/nixos/hostinger-vps/hardware.nix
