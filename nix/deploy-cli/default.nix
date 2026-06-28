# geosyntra-deploy — Nix package wrapping deploy scripts.
{ lib, pkgs, deploy-rs }:

let
  cliSrc = ./.;
in
  pkgs.stdenvNoCC.mkDerivation {
    pname = "geosyntra-deploy";
    version = "0.1.0";

    src = cliSrc;

    nativeBuildInputs = [ pkgs.makeWrapper ];

    dontBuild = true;

    installPhase = ''
      mkdir -p "$out/bin" "$out/lib/geosyntra-deploy/lib" "$out/lib/geosyntra-deploy/commands"
      cp lib/*.sh "$out/lib/geosyntra-deploy/lib/"
      cp commands/*.sh "$out/lib/geosyntra-deploy/commands/"
      substituteInPlace geosyntra-deploy.sh --replace '@out@' "$out"
      install -m755 geosyntra-deploy.sh "$out/bin/geosyntra-deploy"

      for prog in nix rsync ssh scp pg_dump pg_restore; do
        if command -v "$prog" >/dev/null; then true; fi
      done

      wrapProgram "$out/bin/geosyntra-deploy" \
        --prefix PATH : ${lib.makeBinPath [
          pkgs.nix
          pkgs.rsync
          pkgs.openssh
          pkgs.postgresql
          deploy-rs
          pkgs.nodejs_20
          pkgs.git
        ]} \
        --set GEOSYNTRA_DEPLOY_LIB "$out/lib/geosyntra-deploy"
    '';

    meta = with lib; {
      description = "GeoSyntra Hostinger VPS deploy CLI (Express main, Axum app subdomain)";
      license = licenses.mit;
      mainProgram = "geosyntra-deploy";
    };
  }
