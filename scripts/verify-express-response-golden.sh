#!/usr/bin/env bash
# Verify Express public responses against migration/express-response-golden.tsv.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPRESS_URL="${EXPRESS_URL:-http://127.0.0.1:3001}"
GOLDEN="$ROOT/migration/express-response-golden.tsv"

if ! curl -sS -o /dev/null -w "%{http_code}" "${EXPRESS_URL}/health" | grep -q 200; then
  echo "Express not reachable at ${EXPRESS_URL} — start backend and retry." >&2
  exit 1
fi

python3 - "$EXPRESS_URL" "$GOLDEN" <<'PY'
import json, sys, urllib.request

base, golden_path = sys.argv[1], sys.argv[2]

def sorted_keys(data):
    return sorted(data.keys()) if isinstance(data, dict) else []

def fetch(method, path, body=None):
    url = base + path.split("?")[0] if method != "GET" else base + path
    if "?" in path and method == "GET":
        url = base + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        text = resp.read().decode()
        return resp.status, text

failures = 0
with open(golden_path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        method, path, body_raw, status_expect, expect = line.split("\t", 4)
        body = json.loads(body_raw) if body_raw.strip() else None
        status, text = fetch(method, path, body)
        if status != int(status_expect):
            print(f"FAIL {method} {path}: status {status} != {status_expect}")
            failures += 1
            continue
        if expect.startswith("text:"):
            if text != expect[5:]:
                print(f"FAIL {method} {path}: body text mismatch")
                failures += 1
        elif expect.startswith("json_keys:"):
            keys = sorted_keys(json.loads(text or "{}"))
            expected = sorted(expect[10:].split(","))
            if keys != expected:
                print(f"FAIL {method} {path}: keys {keys} != {expected}")
                failures += 1
        elif expect.startswith("json_has:"):
            field = expect[9:]
            if field not in json.loads(text or "{}"):
                print(f"FAIL {method} {path}: missing {field}")
                failures += 1

if failures:
    print(f"{failures} express golden mismatch(es)")
    sys.exit(1)
print("Express response golden OK")
PY
