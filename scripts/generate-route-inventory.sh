#!/usr/bin/env bash
# Regenerate Express → Axum migration route checklist with Axum implementation status.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/migration/express-route-inventory.md"
GOLDEN="$ROOT/migration/axum-route-inventory.golden"

# Express :param → inventory path; golden uses {param}
normalize_express_path() {
  local path="$1"
  path="${path//\$\{provider\}/:provider}"
  path="${path//\{id\}/:id}"
  path="${path//\{table\}/:table}"
  path="${path//\{rowId\}/:rowId}"
  path="${path//\{name\}/:name}"
  path="${path//\{geoId\}/:geoId}"
  path="${path//\{*path\}/:path}"
  path="${path//\{owner\}/:owner}"
  path="${path//\{repo\}/:repo}"
  echo "$path"
}

declare -A AXUM_DONE=()
if [[ -f "$GOLDEN" ]]; then
  while IFS=$'\t' read -r method path _; do
    [[ -z "$method" ]] && continue
    if [[ "$path" == "/health" ]]; then
      key="get|/api/platform/health"
      AXUM_DONE["$key"]=1
      key="get|/health"
      AXUM_DONE["$key"]=1
    elif [[ "$path" == "*" ]]; then
      key="get|*"
      AXUM_DONE["$key"]=1
    else
      norm="$(normalize_express_path "$path")"
      key="$(echo "$method" | tr '[:upper:]' '[:lower:]')|${norm}"
      AXUM_DONE["$key"]=1
    fi
  done <"$GOLDEN"
fi

mkdir -p "$(dirname "$OUT")"
{
  echo "# Express route inventory"
  echo ""
  echo "Generated for Axum migration parity tests. Re-run:"
  echo "\`scripts/generate-route-inventory.sh\`"
  echo ""
  echo "Axum implemented count: $(wc -l <"$GOLDEN" | tr -d ' ')"
  echo ""
  echo "| Method | Path | Axum status |"
  echo "|--------|------|-------------|"

  while IFS= read -r line; do
    method="$(echo "$line" | sed -n 's/^| `\([^`]*\)`.*/\1/p')"
    path="$(echo "$line" | sed -n 's/^| `[^`]*` | `\([^`]*\)`.*/\1/p')"
    key="${method}|${path}"
    if [[ -n "${AXUM_DONE[$key]:-}" ]]; then
      status="✅ implemented"
    else
      status="pending"
    fi
    echo "| \`$method\` | \`$path\` | $status |"
  done < <(
    rg -o "app\\.(get|post|put|patch|delete|use)\\(['\`]([^'\`]+)['\`]" "$ROOT/backend/server" \
      -r '| `$1` | `$2` | pending |' --no-filename | sort -u
  )
} >"$OUT"

implemented="$(grep -c '✅ implemented' "$OUT" || true)"
pending="$(grep -c '| pending |' "$OUT" || true)"
echo "Wrote $OUT ($implemented implemented, $pending pending)"
