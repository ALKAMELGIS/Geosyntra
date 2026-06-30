#!/usr/bin/env bash
# Prepare restore artifacts from migration/vps-backup/latest for post-NixOS install.
# Does NOT modify VPS — local only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPRESS_DB="${GEOSYNTRA_DB_EXPRESS:-geosyntra_express}"
AXUM_DB="${GEOSYNTRA_DB_AXUM:-geosyntra_axum}"
GIS_DB="${GEOSYNTRA_DB_GIS:-geosyntra_gis}"

BACKUP_DIR="${1:-${GEOSYNTRA_BACKUP_DIR:-${ROOT}/migration/vps-backup/latest}}"
if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup dir not found: ${BACKUP_DIR}" >&2
  echo "Run: geosyntra-deploy backup pull" >&2
  exit 2
fi

RESTORE_OUT="${ROOT}/migration/vps-backup/restore-ready"
mkdir -p "${RESTORE_OUT}/env" "${RESTORE_OUT}/postgres" "${RESTORE_OUT}/data" "${RESTORE_OUT}/scripts"

echo "==> Preparing restore bundle from ${BACKUP_DIR}"

copy_if() {
  local src="$1" dst="$2"
  if [[ -f "$src" ]]; then
    cp -a "$src" "$dst"
    echo "  env: $(basename "$dst")"
  fi
}

# Prefer canonical env paths, fall back to discovered copies
for src dst in \
  "${BACKUP_DIR}/env/api.env" "${RESTORE_OUT}/env/express.env.from-vps" \
  "${BACKUP_DIR}/env/__etc_geosyntra_api_env" "${RESTORE_OUT}/env/express.env.from-vps" \
  "${BACKUP_DIR}/env/api-staging.env" "${RESTORE_OUT}/env/axum-staging.env.from-vps" \
  "${BACKUP_DIR}/env/__etc_geosyntra_api-staging_env" "${RESTORE_OUT}/env/axum-staging.env.from-vps" \
  "${BACKUP_DIR}/env/hostinger.secrets.env.local-copy" "${RESTORE_OUT}/env/hostinger.secrets.env.from-vps"; do
  if [[ ! -f "$dst" ]]; then
    copy_if "$src" "$dst"
  fi
done

# Copy all env snapshots for operator review
if [[ -d "${BACKUP_DIR}/env" ]]; then
  mkdir -p "${RESTORE_OUT}/env/all-from-vps"
  cp -a "${BACKUP_DIR}/env/." "${RESTORE_OUT}/env/all-from-vps/" 2>/dev/null || true
fi

if [[ -d "${BACKUP_DIR}/postgres" ]]; then
  cp -a "${BACKUP_DIR}/postgres/." "${RESTORE_OUT}/postgres/" 2>/dev/null || true
  echo "  postgres dumps copied"
fi
if [[ -d "${BACKUP_DIR}/data" ]]; then
  rsync -a "${BACKUP_DIR}/data/" "${RESTORE_OUT}/data/" 2>/dev/null || true
  echo "  data/ copied"
fi

pick_express_dump() {
  for f in express.dump express_alt.dump; do
    [[ -s "${RESTORE_OUT}/postgres/${f}" ]] && { echo "${RESTORE_OUT}/postgres/${f}"; return 0; }
  done
  # Fall back to first geosyntra* cluster dump
  local f
  for f in "${RESTORE_OUT}"/postgres/cluster__*.dump; do
    [[ -f "$f" ]] || continue
    echo "$f"
    return 0
  done
  return 1
}

pick_axum_dump() {
  for f in axum_staging.dump axum_staging_alt.dump; do
    [[ -s "${RESTORE_OUT}/postgres/${f}" ]] && { echo "${RESTORE_OUT}/postgres/${f}"; return 0; }
  done
  return 1
}

EXPRESS_DUMP="$(pick_express_dump 2>/dev/null || true)"
AXUM_DUMP="$(pick_axum_dump 2>/dev/null || true)"

cat >"${RESTORE_OUT}/env/nixos-database-urls.example" <<EOF
# After NixOS install — encrypt into secrets/api.yaml via sops (never commit plaintext)
# Express production (api.geosyntra.org :3001):
DATABASE_URL=postgres://geosyntra:CHANGE_ME@127.0.0.1:5432/${EXPRESS_DB}

# Axum preview (app.geosyntra.org :3003):
# DATABASE_URL=postgres://geosyntra:CHANGE_ME@127.0.0.1:5432/${AXUM_DB}

# Future GIS read models:
# DATABASE_URL=postgres://geosyntra:CHANGE_ME@127.0.0.1:5432/${GIS_DB}
EOF

cat >"${RESTORE_OUT}/scripts/restore-postgres-on-nixos.sh" <<'SCRIPT'
#!/usr/bin/env bash
# Run ON the NixOS host after nixos-rebuild (PostgreSQL service up).
set -euo pipefail
RESTORE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXPRESS_DB="${GEOSYNTRA_DB_EXPRESS:-geosyntra_express}"
AXUM_DB="${GEOSYNTRA_DB_AXUM:-geosyntra_axum}"

restore_dump() {
  local dump="$1" db="$2"
  [[ -f "$dump" && -s "$dump" ]] || return 0
  echo "==> restore $dump → $db"
  sudo -u postgres createdb "$db" 2>/dev/null || true
  sudo -u postgres pg_restore -d "$db" --no-owner --role=geosyntra "$dump" || \
    sudo -u postgres pg_restore -d "$db" --no-owner "$dump"
}

# Pick dumps prepared by backup restore
for candidate in express.dump express_alt.dump; do
  [[ -s "${RESTORE_DIR}/postgres/${candidate}" ]] && restore_dump "${RESTORE_DIR}/postgres/${candidate}" "$EXPRESS_DB" && break
done

for candidate in axum_staging.dump axum_staging_alt.dump; do
  [[ -s "${RESTORE_DIR}/postgres/${candidate}" ]] && restore_dump "${RESTORE_DIR}/postgres/${candidate}" "$AXUM_DB" && break
done

if [[ -f "${RESTORE_DIR}/postgres/globals.sql" ]]; then
  echo "==> apply globals.sql (review first — roles only)"
  echo "    sudo -u postgres psql -f ${RESTORE_DIR}/postgres/globals.sql"
fi
SCRIPT
chmod +x "${RESTORE_OUT}/scripts/restore-postgres-on-nixos.sh"

cat >"${RESTORE_OUT}/RESTORE.md" <<EOF
# Post-NixOS restore checklist

Source backup: \`${BACKUP_DIR}\`

Target PostgreSQL namespaces (one DB per stack):

| NixOS database | Stack |
|----------------|-------|
| \`${EXPRESS_DB}\` | Express production (\`api.geosyntra.org\`) |
| \`${AXUM_DB}\` | Axum preview (\`app.geosyntra.org\`) |
| \`${GIS_DB}\` | Future GIS (optional) |

## 1. Copy restore bundle to NixOS host

\`\`\`bash
rsync -av migration/vps-backup/restore-ready/ root@VPS:/root/geosyntra-restore/
\`\`\`

## 2. PostgreSQL

Express dump: \`${EXPRESS_DUMP:-none found}\`
Axum dump: \`${AXUM_DUMP:-none found — may share express DB on Ubuntu}\`

\`\`\`bash
# on NixOS host
GEOSYNTRA_DB_EXPRESS=${EXPRESS_DB} GEOSYNTRA_DB_AXUM=${AXUM_DB} \\
  bash /root/geosyntra-restore/scripts/restore-postgres-on-nixos.sh
\`\`\`

If production used **SQLite**, copy \`data/**/*.db\` into NixOS state paths per migration/nixos-hostinger-vps.md.

## 3. Secrets (sops-nix)

1. \`cp secrets/.sops.yaml.example secrets/.sops.yaml\` — add age public key
2. \`cp secrets/api.yaml.example secrets/api.yaml\`
3. Merge keys from \`env/express.env.from-vps\` → \`express_env\` block
4. Merge keys from \`env/axum-staging.env.from-vps\` → \`axum_staging_env\` block
5. Set \`DATABASE_URL\` to namespaced URLs in \`env/nixos-database-urls.example\`
6. \`sops encrypt secrets/api.yaml\`

**APP_ORIGIN must stay split:**
- express: \`https://www.geosyntra.org\`
- axum: \`https://app.geosyntra.org\`

## 4. TLS

NixOS uses ACME (see \`nix/nixos/geosyntra.nix\`). Ubuntu Let's Encrypt certs are in backup \`letsencrypt/\` for reference only.

## 5. Activate config

\`\`\`bash
geosyntra-deploy nixos switch
geosyntra-deploy smoke dioxus --web-url https://app.geosyntra.org --api-url https://app.geosyntra.org
\`\`\`
EOF

echo ""
echo "Restore bundle ready: ${RESTORE_OUT}"
echo "Read: ${RESTORE_OUT}/RESTORE.md"
echo "On NixOS host: ${RESTORE_OUT}/scripts/restore-postgres-on-nixos.sh"
