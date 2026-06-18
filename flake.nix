{
  description = "GeoSyntra — dev shell, Rust API package, deploy-rs for Hostinger Ubuntu VPS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    deploy-rs.url = "github:serokell/deploy-rs";
  };

  outputs = { self, nixpkgs, deploy-rs, ... }@inputs:
    let
      forEachSystem = nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed;
    in {
      packages = forEachSystem (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          packageDefs = import ./nix/packages.nix {
            inherit (pkgs) lib rustPlatform pkg-config openssl writeShellScriptBin;
          };
        in
          packageDefs // {
            default = packageDefs.geosyntra-api;
          });

      apps = forEachSystem (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.geosyntra-api}/bin/geosyntra-api";
        };
        deploy = {
          type = "app";
          program = "${inputs.deploy-rs.packages.${system}.default}/bin/deploy";
        };
      });

      devShells = forEachSystem (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            # System libs for Rust crates (openssl-sys, sqlx/postgres, ring build scripts, …)
            packages = with pkgs; [
              rustc
              cargo
              clippy
              rustfmt
              rust-analyzer
              postgresql
              pkg-config
              openssl
              perl
              direnv
              inputs.deploy-rs.packages.${system}.default
            ];

            env = {
              PGHOST = "127.0.0.1";
              PGPORT = "5433";
              PGUSER = "geosyntra";
              PGPASSWORD = "geosyntra";
              PGDATABASE = "geosyntra_dev";
              PGDATA = "${toString ./.}/.postgres/data";
              DATABASE_URL = "postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev";
              DB_DIALECT = "postgres";
              RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";

              # openssl-sys / native-tls (reqwest default features, etc.)
              OPENSSL_NO_VENDOR = "1";
              PKG_CONFIG_PATH = pkgs.lib.makeSearchPath "lib/pkgconfig" [
                pkgs.openssl.dev
                pkgs.postgresql.lib
              ];

              # Optional sqlx/postgres native linking (PQ_* env fallback)
              LIBPQ_LIB_DIR = "${pkgs.postgresql.lib}/lib";
              LIBPQ_INCLUDE_DIR = "${pkgs.postgresql.lib}/include";
            };

            shellHook = ''
              export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGDATA DATABASE_URL DB_DIALECT
              echo "GeoSyntra devShell — PostgreSQL on ''${PGHOST}:''${PGPORT}"
              echo "Deploy: GEOSYNTRA_DEPLOY_HOST=... nix run .#deploy -- .#hostinger-vps"
              "${./scripts/dev-postgres.sh}" start
            '';
          };
        });

      nixosModules.geosyntra-api = import ./nix/nixos-module.nix;

      deploy = {
        type = "deploy";
        nodes = import ./nix/deploy-hostinger.nix {
          inherit self nixpkgs deploy-rs;
          system = "x86_64-linux";
        };
        inherit (deploy-rs) lib;
      };
    };
}
