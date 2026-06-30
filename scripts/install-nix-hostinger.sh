#!/usr/bin/env bash
# Install Nix (multi-user) on Hostinger Ubuntu VPS for deploy-rs profiles.
# Run on the VPS as root: curl -fsSL ... | bash  OR  scp + bash scripts/install-nix-hostinger.sh
set -euo pipefail

if command -v nix >/dev/null 2>&1; then
  echo "Nix already installed: $(nix --version)"
  exit 0
fi

echo "Installing Determinate Nix (multi-user) on Ubuntu VPS..."
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm

# shellcheck source=/dev/null
. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh

echo "Nix installed: $(nix --version)"
echo "Ensure deploy user can run nix (trusted-users in /etc/nix/nix.conf for non-root deploy)."
