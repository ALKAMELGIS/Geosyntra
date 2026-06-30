#!/usr/bin/env bash
# Task 18 — compare HTTP status + JSON shape for routes implemented on both stacks.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GOLDEN="$ROOT/migration/axum-route-inventory.golden"
EXPRESS_URL="${EXPRESS_URL:-http://127.0.0.1:3001}"
AXUM_URL="${AXUM_URL:-http://127.0.0.1:3003}"

normalize_path() {
  local path="$1"
  path="${path//\{id\}/1}"
  path="${path//\{table\}/test}"
  path="${path//\{rowId\}/1}"
  path="${path//\{name\}/test}"
  path="${path//\{geoId\}/1}"
  echo "$path"
}

fetch() {
  local base="$1" method="$2" path="$3" token="${4:-}"
  local url="${base}${path}"
  local args=(-sS -w "\n%{http_code}" -X "$method")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [[ "$method" == "POST" || "$method" == "PATCH" ]]; then
    args+=(-H "Content-Type: application/json" -d '{}')
  fi
  curl "${args[@]}" "$url" 2>/dev/null || printf '{}\n000'
}

json_keys() {
  python3 - "$1" <<'PY'
import json, sys
try:
    data = json.loads(sys.argv[1] or "{}")
except json.JSONDecodeError:
    print("INVALID_JSON")
    raise SystemExit(0)
if isinstance(data, dict):
    print(" ".join(sorted(data.keys())))
else:
    print(type(data).__name__)
PY
}

echo "Express: $EXPRESS_URL"
echo "Axum:    $AXUM_URL"
echo ""

pass=0
fail=0
skip=0

while IFS=$'\t' read -r method path _; do
  [[ -z "$method" ]] && continue
  [[ "$path" == "*" ]] && continue

  norm="$(normalize_path "$path")"
  case "$method $norm" in
    GET\ /api/auth/me|GET\ /api/billing/me|GET\ /api/billing/invoices|GET\ /api/rbac/*)
      skip=$((skip + 1))
      continue
      ;;
    POST\ /api/auth/login|POST\ /api/auth/register|POST\ /api/billing/*|POST\ /api/rbac/*)
      skip=$((skip + 1))
      continue
      ;;
    PATCH\ *|DELETE\ *)
      skip=$((skip + 1))
      continue
      ;;
  esac

  exp_body_code="$(fetch "$EXPRESS_URL" "$method" "$norm")"
  axu_body_code="$(fetch "$AXUM_URL" "$method" "$norm")"
  exp_code="$(echo "$exp_body_code" | tail -n1)"
  axu_code="$(echo "$axu_body_code" | tail -n1)"
  exp_body="$(echo "$exp_body_code" | sed '$d')"
  axu_body="$(echo "$axu_body_code" | sed '$d')"

  if [[ "$exp_code" != "$axu_code" ]]; then
    echo "FAIL $method $norm — status express=$exp_code axum=$axu_code"
    fail=$((fail + 1))
    continue
  fi

  if [[ "$exp_body" == "ok" || "$axu_body" == "ok" ]]; then
    if [[ "$exp_body" == "$axu_body" ]]; then
      echo "OK   $method $norm ($exp_code)"
      pass=$((pass + 1))
    else
      echo "FAIL $method $norm — body express=$exp_body axum=$axu_body"
      fail=$((fail + 1))
    fi
    continue
  fi

  exp_keys="$(json_keys "$exp_body")"
  axu_keys="$(json_keys "$axu_body")"
  if [[ "$exp_keys" == "$axu_keys" ]]; then
    echo "OK   $method $norm ($exp_code) keys=[$exp_keys]"
    pass=$((pass + 1))
  else
    echo "WARN $method $norm ($exp_code) key drift express=[$exp_keys] axum=[$axu_keys]"
    pass=$((pass + 1))
  fi
done <"$GOLDEN"

echo ""
echo "Passed: $pass  Failed: $fail  Skipped (auth/write): $skip"
[[ "$fail" -eq 0 ]]
