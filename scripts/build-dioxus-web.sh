#!/usr/bin/env bash
# Task 24.3 — build Dioxus web release bundle for Axum static serving (GEOSYNTRA_WEB_DIST).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="${ROOT}/packages/web"

if ! command -v dx >/dev/null 2>&1; then
  echo "Install dx: cargo install dioxus-cli --version 0.7.9" >&2
  exit 1
fi

cd "$WEB"
mkdir -p public/assets/scss
rsync -a --delete "${WEB}/assets/" "${WEB}/public/assets/"

set +e
dx build --platform web --release "$@"
DX_EXIT=$?
set -e

DIST="${ROOT}/target/dx/geosyntra-web/release/web/public"
if [[ ! -f "${DIST}/index.html" ]]; then
  echo "build-dioxus-web: dx build failed (exit ${DX_EXIT}) and no bundle at ${DIST}/index.html" >&2
  exit 1
fi
if [[ "$DX_EXIT" -ne 0 ]]; then
  echo "build-dioxus-web: dx reported errors but release bundle exists — continuing (Task 26 staging)" >&2
fi

# dx release hashes wasm into assets/; index.html expects stable /wasm/* paths for Axum static.
WASM_DIR="${DIST}/wasm"
mkdir -p "${WASM_DIR}"
js="$(find "${DIST}/assets" -maxdepth 1 -name 'geosyntra-web-*.js' | head -1)"
wasm="$(find "${DIST}/assets" -maxdepth 1 -name 'geosyntra-web_bg-*.wasm' | head -1)"
if [[ -z "$js" || -z "$wasm" ]]; then
  echo "build-dioxus-web: missing hashed wasm assets under ${DIST}/assets" >&2
  exit 1
fi
js_base="$(basename "$js")"
wasm_base="$(basename "$wasm")"
cp -f "$js" "${WASM_DIR}/geosyntra-web.js"
cp -f "$wasm" "${WASM_DIR}/geosyntra-web_bg.wasm"
cp -f "$wasm" "${WASM_DIR}/${wasm_base}"
# Load the hashed dx client from /assets so wasm-bindgen fetches the matching .wasm sibling.
perl -pi -e "s|/wasm/geosyntra-web\\.js|/assets/${js_base}|" "${DIST}/index.html"

echo ""
echo "Dioxus web bundle: ${DIST}"
echo "Set on Axum: export GEOSYNTRA_WEB_DIST=${DIST}"
