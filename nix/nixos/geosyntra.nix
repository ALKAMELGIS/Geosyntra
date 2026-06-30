# GeoSyntra NixOS module — dual stack with per-stack PostgreSQL databases.
{ config, lib, pkgs, ... }:

let
  cfg = config.services.geosyntra;
  dbNs = import ../database-namespaces.nix;
in {
  options.services.geosyntra = {
    enable = lib.mkEnableOption "GeoSyntra dual-stack (Express main + Axum preview)";

    expressEnable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Express production API on :3001 (api.geosyntra.org)";
    };

    axumEnable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Axum preview on :3003 (app.geosyntra.org)";
    };

    reactEnable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Serve React static on www.geosyntra.org";
    };

    reactRoot = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "React static root; default uses geosyntra-react-static package when set in host config";
    };

    axumPackage = lib.mkOption {
      type = lib.types.package;
      description = "geosyntra-api package";
    };

    axumWebRoot = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Dioxus static public/ directory for GEOSYNTRA_WEB_DIST";
    };

    expressEnvFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Environment file for Express (sops-nix path)";
    };

    axumEnvFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Environment file for Axum staging (sops-nix path)";
    };

    postgresPasswordFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "File containing PostgreSQL password for role geosyntra";
    };
  };

  config = lib.mkIf cfg.enable {
    services.postgresql = {
      enable = true;
      ensureDatabases = [
        dbNs.expressDatabase
        dbNs.axumDatabase
        dbNs.gisDatabase
      ];
      ensureUsers = [
        {
          name = dbNs.dbUser;
          ensureDBOwnership = false;
        }
      ];
    };

    # Create databases with separate namespaces (one DB per stack)
    systemd.services.geosyntra-postgres-init = {
      description = "Ensure GeoSyntra PostgreSQL databases exist";
      wantedBy = [ "multi-user.target" ];
      before = [ "geosyntra-api-staging.service" ];
      after = [ "postgresql.service" ];
      requires = [ "postgresql.service" ];
      serviceConfig.Type = "oneshot";
      script = ''
        ${pkgs.postgresql}/bin/psql -v ON_ERROR_STOP=1 <<-'EOSQL'
          SELECT 'CREATE DATABASE ${dbNs.expressDatabase}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbNs.expressDatabase}')\gexec
          SELECT 'CREATE DATABASE ${dbNs.axumDatabase}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbNs.axumDatabase}')\gexec
          SELECT 'CREATE DATABASE ${dbNs.gisDatabase}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbNs.gisDatabase}')\gexec
        EOSQL
      '';
    };

    services.nginx = {
      enable = true;
      recommendedProxySettings = true;
      virtualHosts = {
        "www.geosyntra.org" = lib.mkIf cfg.reactEnable {
          forceSSL = true;
          enableACME = true;
          serverAliases = [ "geosyntra.org" ];
          root = lib.mkIf (cfg.reactRoot != null) cfg.reactRoot;
          locations."/" = {
            tryFiles = "$uri $uri/ /index.html";
          };
        };

        "api.geosyntra.org" = lib.mkIf cfg.expressEnable {
          forceSSL = true;
          enableACME = true;
          locations."/" = {
            proxyPass = "http://127.0.0.1:3001";
            extraConfig = ''
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "upgrade";
            '';
          };
        };

        "app.geosyntra.org" = lib.mkIf cfg.axumEnable {
          forceSSL = true;
          enableACME = true;
          locations."/" = {
            proxyPass = "http://127.0.0.1:3003";
            extraConfig = "proxy_request_buffering off;";
          };
        };
      };
    };

    security.acme = {
      acceptTerms = true;
      defaults.email = "admin@geosyntra.org";
    };

    systemd.services.geosyntra-api-staging = lib.mkIf cfg.axumEnable {
      description = "GeoSyntra Axum preview (app subdomain :3003)";
      after = [ "network-online.target" "postgresql.service" "geosyntra-postgres-init.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        ExecStart = "${cfg.axumPackage}/bin/geosyntra-api";
        WorkingDirectory = "/var/lib/geosyntra-api-staging";
        Environment = [
          "GEOSYNTRA_BIND_HOST=127.0.0.1"
          "GEOSYNTRA_API_PORT=3003"
          "RUST_LOG=info"
        ] ++ lib.optional (cfg.axumWebRoot != null) "GEOSYNTRA_WEB_DIST=${toString cfg.axumWebRoot}";
        EnvironmentFile = lib.mkIf (cfg.axumEnvFile != null) cfg.axumEnvFile;
        Restart = "on-failure";
      };
    };

    systemd.tmpfiles.rules = [
      "d /var/lib/geosyntra-api-staging 0755 root root -"
      "d /var/www/geosyntra-react 0755 root root -"
    ];
  };
}
