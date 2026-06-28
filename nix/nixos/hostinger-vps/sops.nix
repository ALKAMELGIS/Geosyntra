# Optional sops-nix secrets — imported only when secrets/api.yaml exists locally.
{ config, lib, inputs, ... }:

let
  secretsFile = ../../../secrets/api.yaml;
in {
  imports = [ inputs.sops-nix.nixosModules.sops ];

  sops = {
    defaultSopsFile = secretsFile;
    age.keyFile = "/var/lib/sops-nix/key.txt";
    secrets.express-env = {
      path = "/run/secrets/express.env";
      mode = "0400";
    };
    secrets.axum-staging-env = {
      path = "/run/secrets/axum-staging.env";
      mode = "0400";
    };
  };

  services.geosyntra.expressEnvFile = config.sops.secrets.express-env.path;
  services.geosyntra.axumEnvFile = config.sops.secrets.axum-staging-env.path;
}
