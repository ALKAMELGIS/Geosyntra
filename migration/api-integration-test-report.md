# API integration test report

**Date:** 2026-06-14  
**Branch:** `feature/axum-migration`  
**Harness:** `packages/api/tests/api_integration.rs` + `reqwest` → live Axum TCP server  
**Database:** `postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev`

## Executive summary

| Check | Result |
|-------|--------|
| **`axum_api_integration_suite`** | **PASS** (1/1, 5.57s) |
| Route golden parity (`interface` crate) | PASS (2/2) |
| Express route coverage | 26 / 141 (**18%**) |

All implemented Axum routes were exercised over HTTP against a real PostgreSQL instance with seeded dummy users.

---

## How to reproduce

```bash
scripts/dev-postgres.sh start
scripts/run-api-integration-tests.sh
```

Or:

```bash
export DATABASE_URL=postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev
cargo test -p geosyntra-api --test api_integration -- --ignored --nocapture
```

---

## Test run (2026-06-14)

```
running 1 test
test axum_api_integration_suite ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.54s
```

Build time: ~11s (incremental). Total wall time: ~17s.

---

## Seed data (dummy users)

| ID | Email | Username | Role | Status | Password |
|----|-------|----------|------|--------|----------|
| 900001 | `owner@test.local` | `owner_test` | Owner | Active | `TestPass1!` |
| 900002 | `member@test.local` | `member_test` | Trial User | Active | `TestPass1!` |
| 900003 | `pending@test.local` | `pending_test` | Trial User | Pending Approval | `TestPass1!` |

Bootstrap: migrations + RBAC MATRIX seed + table reset via `packages/api/src/integration_seed.rs`.

---

## Scenarios covered

### Health & public

| Endpoint | Method | Expected | Verified |
|----------|--------|----------|----------|
| `/health` | GET | `200` body `ok` | ✅ |
| `/api/billing/plans` | GET | `200`, `{ ok: true, plans: [...] }` | ✅ |
| `/api/billing/webhook` | POST | `503` `stripe_webhook_not_configured` | ✅ |

### Auth

| Scenario | Expected | Verified |
|----------|----------|----------|
| Register new user | `200`, status `Pending Verification` | ✅ |
| Login pending user | `400` `pending_approval` | ✅ |
| `/api/auth/me` without bearer | `400` `missing_authorization` | ✅ |
| Owner login + `/api/auth/me` | `200`, email matches | ✅ |
| Login with `remember: true` + refresh | `200`, new `access_token` | ✅ |

### RBAC

| Endpoint / flow | Expected | Verified |
|-----------------|----------|----------|
| `GET /api/rbac/me` | `200`, echoes `accessToken` | ✅ |
| `GET /api/rbac/users` | `200`, ≥2 users | ✅ |
| `GET /api/rbac/audit` | `200`, `{ ok: true }` | ✅ |
| `GET /api/rbac/permissions/matrix` | `200`, non-empty matrix | ✅ |
| Approve / suspend / reactivate user 900003 | `200` each | ✅ |
| `PATCH /api/rbac/users/900002` role → viewer | `200` | ✅ |
| `DELETE /api/rbac/users/900001` (self) | `400` `cannot_delete_self` | ✅ |
| Create invite → preview → accept | `201` → `200` → `200` + token | ✅ |

### Billing

| Endpoint | Expected | Verified |
|----------|----------|----------|
| `GET /api/billing/me` (member) | `200`, subscription object | ✅ |
| `POST /api/billing/start-trial` | `200`, `{ ok: true }` | ✅ |
| `POST /api/billing/activate` | `200`, `{ ok: true }` | ✅ |
| `GET /api/billing/invoices` (member) | `200`, `{ ok: true, invoices: [] }` | ✅ |
| `POST /api/billing/payment-intent` (no Stripe) | `503` `stripe_not_configured` | ✅ |
| `POST /api/billing/create-checkout-session` (no Stripe) | `503` `stripe_not_configured` | ✅ |

### Route smoke (26 routes)

Every route in `route_catalog.rs` received an HTTP request; none returned **404 Not Found** (invite preview may return `404` for invalid token — Express parity).

---

## Routes tested (26)

| Method | Path |
|--------|------|
| GET | `/health` |
| POST | `/api/auth/login` |
| POST | `/api/auth/register` |
| GET | `/api/auth/me` |
| POST | `/api/auth/refresh` |
| GET | `/api/rbac/me` |
| GET | `/api/rbac/users` |
| PATCH | `/api/rbac/users/{id}` |
| DELETE | `/api/rbac/users/{id}` |
| POST | `/api/rbac/users/{id}/approve` |
| POST | `/api/rbac/users/{id}/suspend` |
| POST | `/api/rbac/users/{id}/reactivate` |
| GET | `/api/rbac/audit` |
| GET | `/api/rbac/invites` |
| POST | `/api/rbac/invites` |
| GET | `/api/rbac/invites/preview` |
| POST | `/api/rbac/invites/accept` |
| GET | `/api/rbac/permissions/matrix` |
| GET | `/api/billing/plans` |
| GET | `/api/billing/me` |
| GET | `/api/billing/invoices` |
| POST | `/api/billing/start-trial` |
| POST | `/api/billing/activate` |
| POST | `/api/billing/payment-intent` |
| POST | `/api/billing/create-checkout-session` |
| POST | `/api/billing/webhook` |

---

## Express parity notes

| Area | Axum behavior | Express delta |
|------|---------------|---------------|
| Auth login JSON | `access_token` (snake_case) | Express uses `accessToken` |
| Auth success wrapper | No top-level `ok` on login | Express `{ ok: true, … }` |
| RBAC / billing success | `{ ok: true, … }` | Matches |
| Errors | `{ error, code }` | Express `{ ok: false, error }` |
| Invite create | Returns `token` field | Aligns with dev invite link |

---

## Known gaps (not in this suite)

- Side-by-side Express `:3001` vs Axum `:3003` response diff
- Stripe live API calls when `STRIPE_SECRET_KEY` is set (stubs return 502 today)
- Geo/AOI, gateway, static SPA routes (115 Express routes pending)
- Parallel test processes (single suite by design — shared server thread)

---

## Related files

| File | Role |
|------|------|
| `packages/api/tests/api_integration.rs` | Test suite |
| `packages/api/tests/common/mod.rs` | Server + reqwest harness |
| `packages/api/src/integration_seed.rs` | DB reset + dummy users |
| `scripts/run-api-integration-tests.sh` | Runner script |
| `migration/axum-route-inventory.golden` | Route inventory golden file |
