# Nix store / generation retention for 50G Hostinger VPS.
# Runs after every nixos-rebuild switch (via activationScripts).
{ config, lib, pkgs, ... }:
let
  # Keep current + two older system profiles (3 boot configs in GRUB).
  keepGenerations = 3;
  nix = pkgs.nix;
in {
  # Periodic GC off — cleanup is tied to switch (below).
  nix.gc.automatic = lib.mkDefault false;

  system.activationScripts.nixStoreCleanupAfterSwitch = {
    text = ''
      echo "==> nix store: retain last ${toString keepGenerations} system generations, then GC"
      ${nix}/bin/nix-env -p /nix/var/nix/profiles/system \
        --delete-generations +${toString keepGenerations} 2>/dev/null || true
      ${nix}/bin/nix-collect-garbage -d 2>/dev/null || true
      echo "==> nix store cleanup done"
    '';
  };
}
