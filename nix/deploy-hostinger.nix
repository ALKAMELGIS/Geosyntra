# deploy-rs node profile for Hostinger Ubuntu VPS (Nix multi-user layer, not NixOS).
{ self, nixpkgs, deploy-rs, system }:

let
  pkgsLib = nixpkgs.lib;
  lib = deploy-rs.lib.${system};
  packages = self.packages.${system};

  deployHost = builtins.getEnv "GEOSYNTRA_DEPLOY_HOST";
  deployUser = builtins.getEnv "GEOSYNTRA_DEPLOY_USER";
  deployPort = builtins.getEnv "GEOSYNTRA_DEPLOY_PORT";

  hostname =
    if deployHost != "" then deployHost else "CHANGE_ME_HOSTINGER_VPS";

  sshUser =
    if deployUser != "" then deployUser else "root";

  sshOpts =
    if deployPort != "" then [ "-p" deployPort ] else [ ];
in {
  hostinger-vps = {
    inherit hostname sshUser sshOpts;

    profiles.geosyntra-api = {
      user = "root";
      path = lib.activate.custom {
        script = ''
          ${packages.geosyntra-api-systemd}/bin/geosyntra-api-activate
        '';
        bin = packages.geosyntra-api;
      };
    };

    profiles.geosyntra-api-staging = {
      user = "root";
      path = lib.activate.custom {
        script = ''
          ${packages.geosyntra-api-staging-systemd}/bin/geosyntra-api-staging-activate
        '';
        bin = packages.geosyntra-api;
      };
    };
  };
}
