#!/usr/bin/env bash
# Pull missing platform tokens from VPS env/vault/DB and online Express (owner JWT).
# Merges into .envrc.local (never overwrites existing keys) and upserts into local Postgres via Axum.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_LOCAL="${GEOSYNTRA_ENV_LOCAL:-${ROOT}/.envrc.local}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

VPS_HOST="${GEOSYNTRA_VPS_HOST:-2.24.11.216}"
VPS_USER="${GEOSYNTRA_VPS_USER:-root}"
VPS_PORT="${GEOSYNTRA_VPS_SSH_PORT:-22}"
SSH_IDENTITY="${GEOSYNTRA_VPS_SSH_IDENTITY:-${HOME}/.ssh/id_ed25519}"

EXPRESS_URL="${EXPRESS_URL:-https://api.geosyntra.org}"
EXPRESS_EMAIL="${EXPRESS_ADMIN_EMAIL:-admin@geosyntra.com}"
EXPRESS_PASSWORD="${EXPRESS_ADMIN_PASSWORD:-}"

LOCAL_API="${GEOSYNTRA_API_URL:-http://127.0.0.1:3003}"
LOCAL_EMAIL="${SMOKE_EMAIL:-admin@geosyntra.com}"
LOCAL_PASSWORD="${SMOKE_PASSWORD:-GeoSyntra-Admin-2026!}"

PULLED_ENV="${TMP_DIR}/pulled.env"
PULLED_VAULT="${TMP_DIR}/api_secrets.json"
touch "$PULLED_ENV"

log() { echo "==> $*"; }
warn() { echo "pull-remote-tokens: $*" >&2; }

ssh_vps() {
  local extra=()
  [[ -f "$SSH_IDENTITY" ]] && extra+=(-i "$SSH_IDENTITY")
  ssh "${extra[@]}" -o BatchMode=yes -o ConnectTimeout=12 -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" "$@"
}

# --- Token registry: name -> primary env key (+ legacy vault builtin key) ---
declare -A TOKEN_ENV=(
  [mapbox]=MAPBOX_TOKEN
  [arcgis]=ARCGIS_PORTAL_TOKEN
  [sentinelhub]=SENTINEL_HUB_ACCESS_TOKEN
  [sentinelhub_wms]=SENTINEL_HUB_WMS_INSTANCE_ID
  [openweathermap]=OPENWEATHERMAP_API_KEY
  [gemini]=GEMINI_API_KEY
  [claude]=ANTHROPIC_API_KEY
  [openai]=OPENAI_API_KEY
  [deepseek]=DEEPSEEK_API_KEY
  [openrouteservice]=OPENROUTESERVICE_API_KEY
  [graphhopper]=GRAPHHOPPER_API_KEY
)

declare -A LEGACY_BUILTIN=(
  [arcgisPortalToken]=ARCGIS_PORTAL_TOKEN
  [claudeApiKey]=ANTHROPIC_API_KEY
  [graphHopperApiKey]=GRAPHHOPPER_API_KEY
  [orsApiKey]=OPENROUTESERVICE_API_KEY
  [geminiApiKey]=GEMINI_API_KEY
  [deepseekApiKey]=DEEPSEEK_API_KEY
  [openWeatherMapApiKey]=OPENWEATHERMAP_API_KEY
  [sentinelHubAccessToken]=SENTINEL_HUB_ACCESS_TOKEN
  [sentinelHubWmsInstanceId]=SENTINEL_HUB_WMS_INSTANCE_ID
)

append_env_kv() {
  local key="$1" val="$2"
  [[ -z "$val" ]] && return 0
  printf '%s=%q\n' "$key" "$val" >> "$PULLED_ENV"
}

pull_vps_env_files() {
  log "VPS env files (${VPS_USER}@${VPS_HOST}:${VPS_PORT})"
  if ! ssh_vps 'echo ok' >/dev/null 2>&1; then
    warn "SSH unavailable — skip VPS (set GEOSYNTRA_VPS_SSH_IDENTITY or add key on VPS)"
    return 0
  fi

  local remote_script='
set -euo pipefail
for f in \
  /opt/geosyntra-api/.env \
  /etc/geosyntra/api.env \
  /etc/geosyntra/api-staging.env \
  /var/lib/geosyntra-api/.env \
  /var/lib/geosyntra-api-staging/.env
do
  [[ -f "$f" ]] || continue
  echo "# from $f"
  grep -E "^(MAPBOX|ARCGIS|SENTINEL|OPENAI|OPENAI_API|DEEPSEEK|GEMINI|ANTHROPIC|CLAUDE|OPENWEATHER|OPENROUTE|ORS_|GRAPHHOPPER|GOOGLE_MAPS|API_VAULT|GEOSYNTRA_API_VAULT)" "$f" 2>/dev/null || true
done
'
  ssh_vps "$remote_script" >> "$PULLED_ENV" || warn "VPS env scrape failed"
}

pull_vps_vault() {
  log "VPS legacy API vault (geosyntra_api_secrets.json)"
  if ! ssh_vps 'echo ok' >/dev/null 2>&1; then
    return 0
  fi
  local paths=(
    "/var/lib/geosyntra-api/data/geosyntra_api_secrets.json"
    "/opt/geosyntra-api/data/geosyntra_api_secrets.json"
    "/var/lib/geosyntra-api/geosyntra_api_secrets.json"
  )
  for p in "${paths[@]}"; do
    if ssh_vps "test -f '$p' && cat '$p'" > "$PULLED_VAULT" 2>/dev/null && [[ -s "$PULLED_VAULT" ]]; then
      log "Fetched vault from $p"
      return 0
    fi
  done
  warn "No API vault file found on VPS"
}

pull_vps_sqlite_tokens() {
  log "VPS SQLite system_tokens"
  if ! ssh_vps 'echo ok' >/dev/null 2>&1; then
    return 0
  fi
  local remote_script='
set -euo pipefail
for db in /var/lib/geosyntra-api/data/geosyntra_platform.db /opt/geosyntra-api/data/geosyntra_platform.db; do
  [[ -f "$db" ]] || continue
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db" "SELECT name, value_envelope FROM system_tokens WHERE active=1;" 2>/dev/null || true
    exit 0
  fi
done
'
  local rows
  rows="$(ssh_vps "$remote_script" 2>/dev/null || true)"
  [[ -z "$rows" ]] && return 0

  while IFS='|' read -r name envelope; do
    name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | xargs)"
    [[ -z "$name" || -z "${TOKEN_ENV[$name]+x}" ]] && continue
    local plain
    plain="$(echo "$envelope" | python3 -c 'import sys,json; d=json.loads(sys.stdin.read() or "{}"); print(d.get("plain",""))' 2>/dev/null || true)"
    [[ -n "$plain" ]] && append_env_kv "${TOKEN_ENV[$name]}" "$plain"
  done <<< "$rows"
}

pull_express_api() {
  log "Express API (${EXPRESS_URL})"
  if [[ -z "$EXPRESS_PASSWORD" ]]; then
    warn "EXPRESS_ADMIN_PASSWORD unset — skip Express secret pull (status-only below)"
  fi

  local login_json token
  if [[ -n "$EXPRESS_PASSWORD" ]]; then
    login_json="$(curl -sfL -X POST "${EXPRESS_URL}/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"${EXPRESS_EMAIL}\",\"password\":\"${EXPRESS_PASSWORD}\"}" 2>/dev/null || true)"
    token="$(echo "$login_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access_token") or d.get("accessToken") or "")' 2>/dev/null || true)"
    if [[ -z "$token" ]]; then
      warn "Express login failed — check EXPRESS_ADMIN_EMAIL / EXPRESS_ADMIN_PASSWORD"
    else
      log "Express owner login OK"
      local secrets_json
      secrets_json="$(curl -sfL -H "Authorization: Bearer ${token}" "${EXPRESS_URL}/api/system/api-secrets" 2>/dev/null || true)"
      echo "$secrets_json" > "${TMP_DIR}/express_secrets.json"
      python3 <<'PY' "$secrets_json" "$PULLED_ENV"
import json, sys, shlex
secrets_path, out = sys.argv[1], sys.argv[2]
legacy = {
    "arcgisPortalToken": "ARCGIS_PORTAL_TOKEN",
    "claudeApiKey": "ANTHROPIC_API_KEY",
    "graphHopperApiKey": "GRAPHHOPPER_API_KEY",
    "orsApiKey": "OPENROUTESERVICE_API_KEY",
    "geminiApiKey": "GEMINI_API_KEY",
    "deepseekApiKey": "DEEPSEEK_API_KEY",
    "openWeatherMapApiKey": "OPENWEATHERMAP_API_KEY",
    "sentinelHubAccessToken": "SENTINEL_HUB_ACCESS_TOKEN",
    "sentinelHubWmsInstanceId": "SENTINEL_HUB_WMS_INSTANCE_ID",
}
try:
    data = json.load(open(secrets_path))
except Exception:
    sys.exit(0)
builtin = (data.get("secrets") or {}).get("builtin") or {}
with open(out, "a") as f:
    for k, env_key in legacy.items():
        v = builtin.get(k)
        if isinstance(v, str) and v.strip():
            f.write(f"{env_key}={shlex.quote(v.strip())}\n")
PY
    fi
  fi

  # Status comparison (no secrets)
  if [[ -n "${token:-}" ]]; then
    curl -sfL -H "Authorization: Bearer ${token}" "${EXPRESS_URL}/api/system/tokens/status" \
      | python3 -c 'import sys,json; d=json.load(sys.stdin); [print(f"  remote {t[\"name\"]}: configured={t.get(\"configured\")} source={t.get(\"source\")}") for t in d.get("tokens",[])]' 2>/dev/null || true
  fi
}

vault_builtin_to_env() {
  [[ ! -s "$PULLED_VAULT" ]] && return 0
  log "Parse VPS vault JSON"
  python3 <<'PY' "$PULLED_VAULT" "$PULLED_ENV"
import json, sys, shlex
vault_path, out = sys.argv[1], sys.argv[2]
legacy = {
    "arcgisPortalToken": "ARCGIS_PORTAL_TOKEN",
    "claudeApiKey": "ANTHROPIC_API_KEY",
    "graphHopperApiKey": "GRAPHHOPPER_API_KEY",
    "orsApiKey": "OPENROUTESERVICE_API_KEY",
    "geminiApiKey": "GEMINI_API_KEY",
    "deepseekApiKey": "DEEPSEEK_API_KEY",
    "openWeatherMapApiKey": "OPENWEATHERMAP_API_KEY",
    "sentinelHubAccessToken": "SENTINEL_HUB_ACCESS_TOKEN",
    "sentinelHubWmsInstanceId": "SENTINEL_HUB_WMS_INSTANCE_ID",
}
try:
    raw = json.load(open(vault_path))
except Exception:
    sys.exit(0)
secrets = raw.get("secretsPlain") or {}
if raw.get("secretsEnvelope"):
    print("Encrypted vault envelope on VPS — decrypt locally with GEOSYNTRA_API_VAULT_MASTER_KEY if needed", file=sys.stderr)
builtin = secrets.get("builtin") or {}
with open(out, "a") as f:
    for k, env_key in legacy.items():
        v = builtin.get(k)
        if isinstance(v, str) and v.strip():
            f.write(f"{env_key}={shlex.quote(v.strip())}\n")
PY
}

merge_into_envrc_local() {
  log "Merge into ${ENV_LOCAL} (missing keys only)"
  python3 <<'PY' "$PULLED_ENV" "$ENV_LOCAL"
import re, sys, shlex
from datetime import datetime, timezone

pulled_path, target = sys.argv[1], sys.argv[2]
existing_keys = set()
try:
    for line in open(target):
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=', line.strip())
        if m:
            existing_keys.add(m.group(1))
except FileNotFoundError:
    pass

new_lines = []
added = []
for line in open(pulled_path):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
    if not m:
        continue
    key, val = m.group(1), m.group(2)
    if key in existing_keys:
        continue
    try:
        val_unquoted = shlex.split(val)[0] if val else ''
    except ValueError:
        val_unquoted = val.strip('"').strip("'")
    if not val_unquoted:
        continue
    new_lines.append(f"{key}={val_unquoted}\n")
    added.append(key)

if not new_lines:
    print("No new env keys to add")
    sys.exit(0)

stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
with open(target, "a") as f:
    f.write(f"\n# pull-remote-tokens {stamp}\n")
    f.writelines(new_lines)
print(f"Added {len(added)} key(s): {', '.join(added)}")
PY
}

sync_local_postgres() {
  log "Upsert pulled tokens into local Postgres via Axum"
  if ! curl -sf "${LOCAL_API}/health" | grep -qx ok 2>/dev/null; then
    warn "Local Axum not running on ${LOCAL_API} — start dev stack then re-run with SYNC_ONLY=1"
    return 0
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_LOCAL"
  set +a

  local login_json token
  login_json="$(curl -sf -X POST "${LOCAL_API}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${LOCAL_EMAIL}\",\"password\":\"${LOCAL_PASSWORD}\"}")"
  token="$(echo "$login_json" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')"
  [[ -z "$token" ]] && { warn "Local login failed"; return 1; }

  curl -sf -X POST -H "Authorization: Bearer ${token}" "${LOCAL_API}/api/system/tokens/migrate-from-vault" >/dev/null || true

  for name in "${!TOKEN_ENV[@]}"; do
    local key="${TOKEN_ENV[$name]}"
    local val="${!key:-}"
    [[ -z "$val" ]] && continue
    local configured
    configured="$(curl -sf -H "Authorization: Bearer ${token}" "${LOCAL_API}/api/system/tokens/status" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((t['configured'] for t in d.get('tokens',[]) if t['name']=='${name}'), False))")"
    if [[ "$configured" == "True" ]]; then
      continue
    fi
    log "  upsert ${name} from env ${key}"
    curl -sf -X PUT -H "Authorization: Bearer ${token}" -H 'Content-Type: application/json' \
      "${LOCAL_API}/api/system/tokens/${name}" \
      -d "$(python3 -c "import json,os; print(json.dumps({'value': os.environ.get('${key}','')}))")" >/dev/null \
      || warn "upsert ${name} failed"
  done
}

report_local_gaps() {
  log "Local token coverage"
  set -a
  # shellcheck disable=SC1090
  [[ -f "$ENV_LOCAL" ]] && source "$ENV_LOCAL"
  set +a
  python3 <<'PY'
import os
registry = [
    ("mapbox", ["MAPBOX_TOKEN","MAPBOX","MAPBOX_ACCESS_TOKEN","MAPBOX_PUBLIC_TOKEN"]),
    ("arcgis", ["ARCGIS_PORTAL_TOKEN"]),
    ("sentinelhub", ["SENTINEL_HUB_ACCESS_TOKEN","SENTINEL_HUB_TOKEN","SENTINEL"]),
    ("sentinelhub_wms", ["SENTINEL_HUB_WMS_INSTANCE_ID"]),
    ("openweathermap", ["OPENWEATHERMAP_API_KEY"]),
    ("gemini", ["GEMINI_API_KEY","GOOGLE_GEMINI_API_KEY"]),
    ("claude", ["ANTHROPIC_API_KEY","CLAUDE_API_KEY"]),
    ("openai", ["OPENAI_API_KEY","OPENAI"]),
    ("deepseek", ["DEEPSEEK_API_KEY","DEEPSEEK"]),
    ("openrouteservice", ["OPENROUTESERVICE_API_KEY","OPENROUTESERVICE","ORS_API_KEY"]),
    ("graphhopper", ["GRAPHHOPPER_API_KEY"]),
]
for name, keys in registry:
    hit = any(os.environ.get(k, "").strip() for k in keys)
    print(f"  {name:18} {'OK' if hit else 'MISSING'}")
PY
}

main() {
  if [[ "${SYNC_ONLY:-}" == "1" ]]; then
    sync_local_postgres
    report_local_gaps
    exit 0
  fi

  pull_vps_env_files
  pull_vps_vault
  vault_builtin_to_env
  pull_vps_sqlite_tokens
  pull_express_api
  merge_into_envrc_local
  sync_local_postgres
  report_local_gaps
  log "Done"
}

main "$@"
