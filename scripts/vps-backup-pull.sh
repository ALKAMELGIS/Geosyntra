#!/usr/bin/env bash
# Read-only backup pull from Ubuntu VPS before nixos-anywhere.
# Stores under migration/vps-backup/<timestamp>/ (gitignored).
# Does NOT modify the VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPRESS_NS="${GEOSYNTRA_DB_EXPRESS:-geosyntra_express}"
AXUM_NS="${GEOSYNTRA_DB_AXUM:-geosyntra_axum}"
GIS_NS="${GEOSYNTRA_DB_GIS:-geosyntra_gis}"

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local k="${BASH_REMATCH[1]}"
      local v="${BASH_REMATCH[2]}"
      v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
      if [[ -z "${!k:-}" ]]; then
        export "$k=$v"
      fi
    fi
  done <"$f"
}

load_env_file "${ROOT}/hostinger.secrets.env"

HOST="${GEOSYNTRA_DEPLOY_HOST:-${VPS_HOST:-${HOSTINGER_SSH_HOST:-}}}"
USER="${GEOSYNTRA_DEPLOY_USER:-${VPS_SSH_USER:-root}}"
PORT="${GEOSYNTRA_DEPLOY_PORT:-${VPS_SSH_PORT:-22}}"

if [[ -z "$HOST" ]]; then
  echo "Set GEOSYNTRA_DEPLOY_HOST or VPS_HOST in hostinger.secrets.env" >&2
  exit 2
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${ROOT}/migration/vps-backup/${TS}"
mkdir -p \
  "${DEST}/env" \
  "${DEST}/data" \
  "${DEST}/postgres" \
  "${DEST}/meta" \
  "${DEST}/nginx" \
  "${DEST}/systemd" \
  "${DEST}/letsencrypt"

SSH=(ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "${USER}@${HOST}")
RSYNC_SSH="ssh -p ${PORT} -o StrictHostKeyChecking=accept-new"

echo "==> VPS backup pull (read-only) → ${DEST}"
echo "    ${USER}@${HOST}:${PORT}"
echo "    NixOS target DB namespaces: express=${EXPRESS_NS} axum=${AXUM_NS} gis=${GIS_NS}"

pull_remote_file() {
  local remote="$1"
  local local_path="$2"
  if "${SSH[@]}" "test -f '${remote}'" 2>/dev/null; then
    echo "  pull ${remote}"
    mkdir -p "$(dirname "$local_path")"
    scp -P "$PORT" -o StrictHostKeyChecking=accept-new \
      "${USER}@${HOST}:${remote}" "${local_path}" 2>/dev/null || true
  fi
}

pull_remote_dir() {
  local remote="$1"
  local local_path="$2"
  if "${SSH[@]}" "test -d '${remote}'" 2>/dev/null; then
    echo "  pull dir ${remote}/"
    mkdir -p "$local_path"
    rsync -az -e "$RSYNC_SSH" \
      "${USER}@${HOST}:${remote}/" "${local_path}/" 2>/dev/null || true
  fi
}

remote_pg_dump_from_env() {
  local env_file="$1"
  local out_file="$2"
  local label="$3"
  if ! "${SSH[@]}" "test -f '${env_file}'" 2>/dev/null; then
    return 0
  fi
  if "${SSH[@]}" bash -s <<REMOTE >"${out_file}" 2>/dev/null
set -euo pipefail
set -a
# shellcheck disable=SC1090
source '${env_file}'
set +a
if [[ -z "\${DATABASE_URL:-}" || "\${DATABASE_URL}" != postgres* ]]; then exit 0; fi
command -v pg_dump >/dev/null
pg_dump "\${DATABASE_URL}" --no-owner --format=custom
REMOTE
  then
    if [[ -s "${out_file}" ]]; then
      echo "  pg_dump ${label} → $(basename "$out_file")"
    else
      rm -f "${out_file}"
    fi
  else
    rm -f "${out_file}"
  fi
}

# --- Environment files & API keys (read-only copy) ---
ENV_PATHS=(
  /etc/geosyntra/api.env
  /etc/geosyntra/api-staging.env
  /etc/geosyntra/express.env
  /etc/geosyntra/axum-staging.env
  /opt/geosyntra-api/.env
  /opt/geosyntra-api-staging/.env
  /var/lib/geosyntra-api/.env
  /var/lib/geosyntra-api-staging/.env
  "${HOSTINGER_APP_DIR:-}/.env"
  /root/.geosyntra.env
)

for remote in "${ENV_PATHS[@]}"; do
  [[ -n "$remote" && "$remote" != "/.env" ]] || continue
  safe="$(echo "$remote" | tr '/.' '__')"
  pull_remote_file "$remote" "${DEST}/env/${safe}"
done

# Discover additional .env files under common roots (read-only find)
echo "  scan remote .env files"
"${SSH[@]}" bash -s <<'REMOTE' >"${DEST}/meta/remote-env-paths.txt" 2>/dev/null || true
set -euo pipefail
for root in /etc/geosyntra /opt /var/lib/geosyntra-api /var/lib/geosyntra-api-staging /home; do
  [[ -d "$root" ]] || continue
  find "$root" -maxdepth 4 -type f \( -name '.env' -o -name '*.env' \) 2>/dev/null || true
done | sort -u
REMOTE

while IFS= read -r remote || [[ -n "$remote" ]]; do
  [[ -n "$remote" ]] || continue
  safe="discovered__$(echo "$remote" | tr '/.' '__')"
  pull_remote_file "$remote" "${DEST}/env/${safe}"
done <"${DEST}/meta/remote-env-paths.txt"

if [[ -f "${ROOT}/hostinger.secrets.env" ]]; then
  cp -a "${ROOT}/hostinger.secrets.env" "${DEST}/env/hostinger.secrets.env.local-copy"
  chmod 600 "${DEST}/env/hostinger.secrets.env.local-copy"
fi

# --- Application data (sqlite, vault json, uploads) ---
for remote_dir in \
  /var/lib/geosyntra-api \
  /var/lib/geosyntra-api-staging \
  /var/www/geosyntra-react \
  /var/www/geosyntra \
  "${GEOSYNTRA_DATA_DIR:-}" \
  /home/u245840661/domains/geosyntra.org/geosyntra-data; do
  [[ -n "$remote_dir" ]] || continue
  base="$(basename "$remote_dir")"
  pull_remote_dir "$remote_dir" "${DEST}/data/${base}"
done

# --- PostgreSQL: per-env dumps + full cluster inventory ---
for pair in \
  "/etc/geosyntra/api.env:express:express.dump" \
  "/etc/geosyntra/api-staging.env:axum_staging:axum_staging.dump" \
  "/etc/geosyntra/express.env:express_alt:express_alt.dump" \
  "/etc/geosyntra/axum-staging.env:axum_alt:axum_staging_alt.dump"; do
  IFS=: read -r env_path _label outfile <<<"$pair"
  remote_pg_dump_from_env "$env_path" "${DEST}/postgres/${outfile}" "$_label"
done

# Dump every non-template PostgreSQL database on the VPS (read-only)
echo "  pg_dumpall databases (inventory + per-db custom dumps)"
"${SSH[@]}" bash -s >"${DEST}/postgres/cluster-inventory.txt" 2>/dev/null <<'REMOTE' || true
set -euo pipefail
if ! command -v psql >/dev/null; then echo "psql not installed"; exit 0; fi
echo "# PostgreSQL cluster inventory $(date -u -Iseconds)"
sudo -u postgres psql -Atc "SELECT datname FROM pg_database WHERE datallowconn AND datname NOT LIKE 'template%'" 2>/dev/null \
  || psql -Atc "SELECT datname FROM pg_database WHERE datallowconn AND datname NOT LIKE 'template%'" 2>/dev/null \
  || true
REMOTE

while IFS= read -r dbname || [[ -n "$dbname" ]]; do
  [[ -z "$dbname" || "$dbname" == \#* ]] && continue
  safe_db="$(echo "$dbname" | tr -c 'A-Za-z0-9._-' '_')"
  echo "  pg_dump cluster db: ${dbname}"
  "${SSH[@]}" bash -s <<REMOTE >"${DEST}/postgres/cluster__${safe_db}.dump" 2>/dev/null || true
set -euo pipefail
command -v pg_dump >/dev/null || exit 0
sudo -u postgres pg_dump "${dbname}" --no-owner --format=custom 2>/dev/null \
  || pg_dump "${dbname}" --no-owner --format=custom 2>/dev/null \
  || true
REMOTE
  if [[ ! -s "${DEST}/postgres/cluster__${safe_db}.dump" ]]; then
    rm -f "${DEST}/postgres/cluster__${safe_db}.dump"
  fi
done <"${DEST}/postgres/cluster-inventory.txt"

# Roles/globals (no passwords in plain pg_dumpall -g, but useful for restore planning)
"${SSH[@]}" bash -s >"${DEST}/postgres/globals.sql" 2>/dev/null <<'REMOTE' || true
set -euo pipefail
command -v pg_dumpall >/dev/null || exit 0
sudo -u postgres pg_dumpall --globals-only 2>/dev/null || pg_dumpall --globals-only 2>/dev/null || true
REMOTE

# --- nginx / TLS / systemd (for post-NixOS hostname parity) ---
pull_remote_file /etc/nginx/sites-enabled/geosyntra "${DEST}/nginx/sites-enabled-geosyntra"
pull_remote_file /etc/nginx/sites-enabled/default "${DEST}/nginx/sites-enabled-default"
pull_remote_dir /etc/nginx/sites-available "${DEST}/nginx/sites-available"
pull_remote_dir /etc/letsencrypt "${DEST}/letsencrypt"

for unit in geosyntra-api geosyntra-api-staging nginx postgresql redis; do
  "${SSH[@]}" "systemctl cat ${unit} 2>/dev/null" >"${DEST}/systemd/${unit}.service" 2>/dev/null || true
done

# --- Remote metadata ---
"${SSH[@]}" bash -s >"${DEST}/meta/remote-status.txt" 2>&1 <<'REMOTE' || true
set -euo pipefail
echo "=== uname ==="
uname -a
echo "=== id ==="
id
echo "=== systemd active ==="
for u in geosyntra-api geosyntra-api-staging nginx postgresql redis; do
  printf '%s: ' "$u"
  systemctl is-active "$u" 2>/dev/null || echo n/a
done
echo "=== listening ports (3001/3003/5432) ==="
ss -tlnp 2>/dev/null | grep -E ':3001|:3003|:5432' || netstat -tlnp 2>/dev/null | grep -E ':3001|:3003|:5432' || true
REMOTE

cat >"${DEST}/manifest.json" <<EOF
{
  "timestamp": "${TS}",
  "host": "${HOST}",
  "user": "${USER}",
  "port": ${PORT},
  "database_namespaces_nixos": {
    "express": "${EXPRESS_NS}",
    "axum": "${AXUM_NS}",
    "gis": "${GIS_NS}"
  },
  "restore_map": {
    "express_production": "${EXPRESS_NS}",
    "axum_preview": "${AXUM_NS}",
    "note": "Restore cluster dumps into namespaced DBs via geosyntra-deploy backup restore"
  },
  "notes": "Run geosyntra-deploy backup restore after nixos-anywhere to prepare sops/env templates"
}
EOF

ln -sfn "${DEST}" "${ROOT}/migration/vps-backup/latest"
echo ""
echo "Backup complete: ${DEST}"
echo "Latest symlink: migration/vps-backup/latest"
echo ""
echo "Review secrets in: ${DEST}/env/ (gitignored — never commit)"
echo "Next: geosyntra-deploy backup restore"
echo "Then (when ready): geosyntra-deploy nixos install --confirm"
