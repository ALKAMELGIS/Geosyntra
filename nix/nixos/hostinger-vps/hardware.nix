# Placeholder for local flake evaluation.
# After nixos-anywhere install, replace with generated hardware-configuration.nix
# (do not commit real disk UUIDs until post-install).
{ config, lib, pkgs, modulesPath, ... }:
{
  imports = [ (modulesPath + "/installer/scan/not-detected.nix") ];

  # Disk + mounts come from disko.nix during install.
  boot.loader.grub.devices = lib.mkDefault [ "/dev/sda" ];
}
