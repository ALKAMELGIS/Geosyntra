{
  description = "GeoSyntra — dev shell, Rust API, geosyntra-deploy CLI, NixOS hostinger-vps";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    deploy-rs.url = "github:serokell/deploy-rs";
    nixos-anywhere.url = "github:nix-community/nixos-anywhere";
    disko.url = "github:nix-community/disko";
    sops-nix.url = "github:Mic92/sops-nix";
  };

  outputs = { self, nixpkgs, deploy-rs, nixos-anywhere, disko, sops-nix, ... }@inputs:
    let
      forEachSystem = nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed;
      linuxSystem = "x86_64-linux";
      linuxPkgs = nixpkgs.legacyPackages.${linuxSystem};
    in {
      packages = forEachSystem (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          packageDefs = import ./nix/packages.nix {
            inherit (pkgs) lib pkgs rustPlatform pkg-config openssl writeShellScriptBin;
            deploy-rs = inputs.deploy-rs.packages.${system}.default;
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
        geosyntra-deploy = {
          type = "app";
          program = "${self.packages.${system}.geosyntra-deploy}/bin/geosyntra-deploy";
        };
        install-hostinger = {
          type = "app";
          program = "${linuxPkgs.writeShellScriptBin "install-hostinger" ''
            cd ${self}
            exec ${self}/scripts/install-nixos-hostinger.sh "$@"
          ''}/bin/install-hostinger";
        };
        deploy-hostinger = {
          type = "app";
          program = "${linuxPkgs.writeShellScriptBin "deploy-hostinger" ''
            cd ${self}
            exec ${self}/scripts/deploy-nixos-hostinger.sh "$@"
          ''}/bin/deploy-hostinger";
        };
      });

      devShells = forEachSystem (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
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
              rsync
              openssh
              inputs.deploy-rs.packages.${system}.default
              self.packages.${system}.geosyntra-deploy
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
              OPENSSL_NO_VENDOR = "1";
              PKG_CONFIG_PATH = pkgs.lib.makeSearchPath "lib/pkgconfig" [
                pkgs.openssl.dev
                pkgs.postgresql.lib
              ];
              LIBPQ_LIB_DIR = "${pkgs.postgresql.lib}/lib";
              LIBPQ_INCLUDE_DIR = "${pkgs.postgresql.lib}/include";
            };

            shellHook = ''
              export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGDATA DATABASE_URL DB_DIALECT
              echo "GeoSyntra devShell — PostgreSQL on ''${PGHOST}:''${PGPORT}"
              echo "Deploy CLI: geosyntra-deploy --help"
              echo "Backup before NixOS: geosyntra-deploy backup pull"
              "${./scripts/dev-postgres.sh}" start
            '';
          };
        });

      nixosModules.geosyntra = import ./nix/nixos/geosyntra.nix;
      nixosModules.geosyntra-api = import ./nix/nixos-module.nix;

      nixosConfigurations.hostinger-vps = nixpkgs.lib.nixosSystem {
        system = linuxSystem;
        specialArgs = { inherit inputs self; };
        modules = [ ./nix/nixos/hostinger-vps/default.nix ];
      };

      deploy = {
        type = "deploy";
        nodes = import ./nix/deploy-hostinger.nix {
          inherit self nixpkgs deploy-rs;
          system = linuxSystem;
        };
        inherit (deploy-rs) lib;
      };
    };
}
