# Express ↔ Axum response parity

Task 18 side-by-side comparison when both servers run against the same Postgres.

## Prerequisites

| Server | Default URL | Start |
|--------|-------------|-------|
| Express | `http://127.0.0.1:3001` | `cd backend && npm start` |
| Axum | `http://127.0.0.1:3003` | `DATABASE_URL=... cargo run -p geosyntra-api` |

## Run

```bash
scripts/compare-api-parity.sh
# or
EXPRESS_URL=http://127.0.0.1:3001 AXUM_URL=http://127.0.0.1:3003 scripts/compare-api-parity.sh
```

The script walks `migration/axum-route-inventory.golden`, hits **public GET/POST** routes on both stacks, and compares HTTP status + top-level JSON keys. Auth-protected and write routes are skipped (covered by `packages/api/tests/api_integration.rs`).

## Known intentional deltas

| Area | Express | Axum |
|------|---------|------|
| Login success | `{ ok: true, accessToken, … }` | `{ access_token, … }` (no top-level `ok`) |
| Errors | `{ ok: false, error }` | `{ error, code }` |
| RBAC/billing success | `{ ok: true, … }` | `{ ok: true, … }` |

Full fixture golden files for Express use `migration/express-response-golden.tsv`:

```bash
scripts/verify-express-response-golden.sh
# Regenerate after intentional Express response changes:
EXPRESS_URL=http://127.0.0.1:3001 scripts/record-express-response-golden.sh
```

Axum public routes use `migration/axum-response-golden.tsv`:

```bash
scripts/verify-axum-response-golden.sh
# Regenerate after intentional response changes:
AXUM_URL=http://127.0.0.1:3003 scripts/record-axum-response-golden.sh
```
