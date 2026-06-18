# GeoSyntra Rust API package for Nix / deploy-rs profiles.
{ lib, rustPlatform, pkg-config, openssl, writeShellScriptBin }:

let
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let base = builtins.baseNameOf path;
      in !(base == "target"
        || base == "node_modules"
        || base == ".git"
        || base == "frontend"
        || base == "backend"
        || base == ".postgres");
  };

  geosyntra-api = rustPlatform.buildRustPackage {
    pname = "geosyntra-api";
    version = "0.1.0";
    inherit src;
    cargoRoot = ".";
    cargoLock.lockFile = ../Cargo.lock;
    cargoBuildFlags = [ "-p geosyntra-api" ];
    nativeBuildInputs = [ pkg-config openssl ];
    doCheck = false;

    meta = with lib; {
      description = "GeoSyntra Axum API (composition root binary)";
      license = licenses.mit;
      mainProgram = "geosyntra-api";
    };
  };

  geosyntra-api-systemd = writeShellScriptBin "geosyntra-api-activate" ''
    set -euo pipefail
    mkdir -p /var/lib/geosyntra-api /etc/geosyntra
    if [ ! -f /etc/geosyntra/api.env ]; then
      echo "# GeoSyntra API — set DATABASE_URL, JWT_SECRET, APP_ORIGIN, …" > /etc/geosyntra/api.env
      chmod 600 /etc/geosyntra/api.env
    fi
    cat > /etc/systemd/system/geosyntra-api.service <<UNIT
[Unit]
Description=GeoSyntra API (Axum / Rust)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=-/etc/geosyntra/api.env
Environment=GEOSYNTRA_BIND_HOST=0.0.0.0
Environment=GEOSYNTRA_API_PORT=3001
Environment=RUST_LOG=info
ExecStart=${geosyntra-api}/bin/geosyntra-api
WorkingDirectory=/var/lib/geosyntra-api
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable geosyntra-api
    systemctl restart geosyntra-api
  '';

  geosyntra-api-staging-systemd = writeShellScriptBin "geosyntra-api-staging-activate" ''
    set -euo pipefail
    mkdir -p /var/lib/geosyntra-api-staging /etc/geosyntra
    if [ ! -f /etc/geosyntra/api-staging.env ]; then
      echo "# GeoSyntra Axum staging (Task 18) — parallel to Express on :3001" > /etc/geosyntra/api-staging.env
      echo "GEOSYNTRA_API_PORT=3003" >> /etc/geosyntra/api-staging.env
      echo "GEOSYNTRA_BIND_HOST=0.0.0.0" >> /etc/geosyntra/api-staging.env
      echo "# DATABASE_URL=postgres://..." >> /etc/geosyntra/api-staging.env
      echo "# JWT_SECRET=..." >> /etc/geosyntra/api-staging.env
      chmod 600 /etc/geosyntra/api-staging.env
    fi
    cat > /etc/systemd/system/geosyntra-api-staging.service <<UNIT
[Unit]
Description=GeoSyntra Axum API staging (:3003, Task 18 parity)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=-/etc/geosyntra/api-staging.env
Environment=GEOSYNTRA_BIND_HOST=0.0.0.0
Environment=GEOSYNTRA_API_PORT=3003
Environment=RUST_LOG=info
ExecStart=${geosyntra-api}/bin/geosyntra-api
WorkingDirectory=/var/lib/geosyntra-api-staging
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable geosyntra-api-staging
    systemctl restart geosyntra-api-staging
  '';
in {
  inherit geosyntra-api geosyntra-api-systemd geosyntra-api-staging-systemd;
}
