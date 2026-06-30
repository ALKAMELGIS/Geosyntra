#!/usr/bin/env bash
# Record Axum responses into migration/axum-response-golden.tsv (public routes only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/migration/axum-response-golden.tsv"
AXUM_URL="${AXUM_URL:-http://127.0.0.1:3003}"

json_keys() {
  python3 - "$1" <<'PY'
import json, sys
data = json.loads(sys.argv[1] or "{}")
if isinstance(data, dict):
    print(",".join(sorted(data.keys())))
PY
}

record() {
  local method="$1" path="$2" body="${3:-}" status_expect="${4:-}"
  local url="${AXUM_URL}${path}"
  local args=(-sS -w "\n%{http_code}" -X "$method")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  local out
  out="$(curl "${args[@]}" "$url")"
  local code="$(echo "$out" | tail -n1)"
  local resp="$(echo "$out" | sed '$d')"
  if [[ "$resp" == "ok" ]]; then
    echo -e "${method}\t${path%\?*}\t${body}\t${code}\ttext:ok"
  else
    local keys="$(json_keys "$resp")"
    echo -e "${method}\t${path}\t${body}\t${code}\tjson_keys:${keys}"
  fi
}

{
  echo "# Axum public-route response golden file (Task 18)."
  echo "# Columns: METHOD, PATH, BODY_JSON (or empty), STATUS, EXPECT"
  echo "# Regenerate: AXUM_URL=... scripts/record-axum-response-golden.sh"
  record GET /health
  record GET /api/billing/plans
  record GET /api/platform/health
  record GET /api/platform/runtime
  record GET /api/auth/oauth/config
  record GET /api/auth/email/status
  record GET "/api/auth/verify-email?token=invalid"
  record POST /api/auth/forgot-password '{"email":"nobody@test.local"}'
  record POST /api/auth/forgot-username '{"email":"nobody@test.local"}'
  record POST /api/auth/resend-verification '{"email":"nobody@test.local"}'
  record POST /api/auth/reset-password '{"token":"bad","password":"short"}'
  record POST /api/billing/webhook '{"type":"test"}'
} >"$OUT"

echo "Wrote $OUT ($(grep -cv '^#' "$OUT" || true) cases)"
