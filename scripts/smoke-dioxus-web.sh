#!/usr/bin/env bash
# Task 24.2 — Dioxus fullstack web smoke (curl; assumes dev or staging stack is up).
set -euo pipefail

WEB_URL="${GEOSYNTRA_WEB_URL:-http://127.0.0.1:8080}"
API_URL="${GEOSYNTRA_API_URL:-http://127.0.0.1:3003}"
EMAIL="${SMOKE_EMAIL:-admin@geosyntra.com}"
PASSWORD="${SMOKE_PASSWORD:-GeoSyntra-Admin-2026!}"

fail() {
  echo "smoke-dioxus-web: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

need_cmd curl
need_cmd jq

echo "==> Web SSR + wasm loader ($WEB_URL)"
html="$(curl -sf "$WEB_URL/" || fail "GET / failed — is dx serve running on $WEB_URL?")"
echo "$html" | grep -qE 'geosyntra-web[^"]*\.js' \
  || fail "HTML missing geosyntra-web client script tag"
echo "$html" | grep -qE 'Sign in|gs-auth|gs-landing|id="main"' \
  || fail "HTML missing landing/auth shell or #main mount point"

js_path="$(echo "$html" | sed -n 's/.*src="\([^"]*geosyntra-web[^"]*\.js\)".*/\1/p' | head -1)"
[[ -n "$js_path" ]] || js_path="/wasm/geosyntra-web.js"

curl -sfI "$WEB_URL${js_path}" | grep -q '200' \
  || fail "GET ${js_path} not 200"

wasm_ok=0
for wasm_path in \
  "/wasm/geosyntra-web_bg.wasm" \
  "/assets/$(basename "$(find "${GEOSYNTRA_WEB_DIST:-}" -name 'geosyntra-web_bg-*.wasm' 2>/dev/null | head -1)" 2>/dev/null)"; do
  [[ -z "$wasm_path" || "$wasm_path" == "/assets/" ]] && continue
  if curl -sfI "$WEB_URL${wasm_path}" | grep -q '200'; then
    wasm_ok=1
    break
  fi
done
[[ "$wasm_ok" -eq 1 ]] || fail "GET geosyntra-web_bg.wasm not 200 (check /wasm or /assets bundle)"
curl -sfI "$WEB_URL/assets/css/app.css" | grep -q '200' \
  || fail "GET /assets/css/app.css not 200 (sync public/assets?)"

echo "==> Axum API ($API_URL)"
curl -sf "$API_URL/health" | grep -qx 'ok' || fail "GET /health failed"

echo "==> Login"
login_json="$(curl -sf -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")" \
  || fail "POST /api/auth/login failed"

token="$(echo "$login_json" | jq -r '.access_token // .accessToken // empty')"
[[ -n "$token" && "$token" != "null" ]] || fail "login response missing access_token"

auth_get() {
  local path="$1"
  local body
  body="$(curl -sf -H "Authorization: Bearer $token" "$API_URL$path")" \
    || fail "GET $path failed"
  echo "$body"
}

echo "==> Admin API paths (Dioxus pages)"
auth_get "/api/rbac/me" | jq -e '.user.email != null or .user.role != null or .user.role_slug != null' >/dev/null
auth_get "/api/rbac/users" | jq -e '.ok == true and (.users | type) == "array"' >/dev/null
auth_get "/api/rbac/policies" | jq -e '.ok == true and (.versions | type) == "array"' >/dev/null
auth_get "/api/rbac/audit?limit=5" | jq -e '.ok == true and (.audit | type) == "array"' >/dev/null
auth_get "/api/rbac/permissions/matrix" | jq -e '.ok == true and (.matrix | type) == "array"' >/dev/null
auth_get "/api/rbac/invites" | jq -e '.ok == true and (.invites | type) == "array"' >/dev/null
auth_get "/api/config/status" | jq -e '.ok == true and (.capabilities | type) == "object"' >/dev/null
auth_get "/api/system/tokens/status" | jq -e '.ok == true and (.tokens | type) == "array"' >/dev/null

echo "smoke-dioxus-web: OK"
