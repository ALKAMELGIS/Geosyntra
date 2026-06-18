# Optional NixOS module (full NixOS hosts). Hostinger VPS uses Ubuntu + Nix layer + deploy-rs instead.
{ config, lib, pkgs, ... }:
let
  cfg = config.services.geosyntra-api;
in {
  options.services.geosyntra-api = {
    enable = lib.mkEnableOption "GeoSyntra Axum API";
    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.geosyntra-api or (throw "geosyntra-api not in nixpkgs; use flake overlay");
      description = "geosyntra-api package";
    };
    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Environment file (DATABASE_URL, JWT_SECRET, …)";
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 3001;
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.geosyntra-api = {
      description = "GeoSyntra API (Axum)";
      after = [ "network-online.target" "postgresql.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        ExecStart = lib.mkForce "${cfg.package}/bin/geosyntra-api";
        Environment = [
          "GEOSYNTRA_BIND_HOST=0.0.0.0"
          "GEOSYNTRA_API_PORT=${toString cfg.port}"
          "RUST_LOG=info"
        ];
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;
        Restart = "on-failure";
        WorkingDirectory = "/var/lib/geosyntra-api";
      };
    };
  };
}
