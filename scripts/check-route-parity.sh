#!/usr/bin/env bash
# Task 18 — compare Axum implemented routes vs Express inventory.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GOLDEN="$ROOT/migration/axum-route-inventory.golden"
EXPRESS="$ROOT/migration/express-route-inventory.md"

axum_count="$(grep -c . "$GOLDEN" || true)"
express_count="$(grep -cE '^\| `(get|post|put|patch|delete)` \|' "$EXPRESS" || true)"
pct=0
if [[ "$express_count" -gt 0 ]]; then
  pct=$((axum_count * 100 / express_count))
fi

echo "Axum implemented routes:  $axum_count"
echo "Express inventory routes: $express_count"
echo "Coverage:                 ${pct}%"
echo ""
echo "Run \`cargo test -p interface route_parity\` to verify golden file sync."

if [[ "$axum_count" -eq 0 ]]; then
  echo "error: no Axum routes in golden file" >&2
  exit 1
fi
