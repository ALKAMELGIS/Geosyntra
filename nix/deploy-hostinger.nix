# deploy-rs node profile for Hostinger Ubuntu VPS (Nix multi-user layer, not NixOS).
#
# PRODUCTION POLICY (locked):
#   - geosyntra-api-staging → :3003 → app.geosyntra.org (Axum + Dioxus preview)
#   - geosyntra-api (production profile) → :3001 MUST NOT replace Express on api.geosyntra.org
#     until explicit cutover. Use `geosyntra-deploy express` for main API.
#   - Prefer: geosyntra-deploy axum staging  (never geosyntra-deploy axum production)
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

    # Legacy production Axum on :3001 — DISABLED by policy until Rust cutover.
    # Uncomment only after Express is retired and nginx api vhost repointed.
    profiles.geosyntra-api = {
      user = "root";
      path = lib.activate.custom {
        script = ''
          echo "ERROR: geosyntra-api production deploy-rs profile is disabled." >&2
          echo "Use: geosyntra-deploy express (main API) or geosyntra-deploy axum staging (app subdomain)" >&2
          exit 1
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
