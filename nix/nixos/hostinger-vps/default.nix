# Hostinger VPS NixOS configuration — dual-stack production policy.
{ config, lib, pkgs, inputs, self, ... }:

let
  system = "x86_64-linux";
  secretsFile = ../../secrets/api.yaml;
  hasSops = builtins.pathExists secretsFile;
in {
  imports =
    [
      ./hardware.nix
      ./disko.nix
      ./networking.nix
      inputs.disko.nixosModules.disko
      ../geosyntra.nix
    ]
    ++ lib.optionals hasSops [ ./sops.nix ];

  disko.devices.disk.main.device = lib.mkDefault "/dev/sda";

  services.geosyntra = {
    enable = true;
    expressEnable = true;
    axumEnable = true;
    reactEnable = true;
    axumPackage = self.packages.${system}.geosyntra-api;
  };

  system.stateVersion = "25.11";
}
