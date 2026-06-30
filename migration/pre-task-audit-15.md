# Pre-Task 16 audit #10 (Tasks 0–15)

**Branch:** `feature/axum-migration`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (185 pass, 3 ignored) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–14** | ✅ | Unchanged from audit #9 |
| **15 ABAC reload + billing** | ✅ | Reloadable auth service, billing routes, webhook stub |

**Safe to continue Task 16** (route expansion: geo, tokens, remaining Express API).

---

## Task 15 delivered

1. **M4 complete** — `ReloadableAuthorizationService` with per-tenant policy cache + `PolicyReloadService` port; reload on JWT auth via `AuthSubject` extractor; `invalidate_tenant` on policy activation
2. **Billing routes** — `GET /api/billing/plans`, `GET /api/billing/me`
3. **Stripe webhook stub** — `POST /api/billing/webhook` (503 when `STRIPE_WEBHOOK_SECRET` unset; raw `Bytes` body)
4. **Express alias** — `GET /api/rbac/me` (user + accessToken echo)
5. **Engine** — `replace_stored_policies` + public `evaluate` for reload service

---

## Still deferred

| Item | Task |
|------|------|
| Full Stripe webhook signature verification + event handling | 16+ |
| Billing activate/trial/checkout routes | 16+ |
| Email invite delivery | 16+ |
| Static files middleware | 16+ |
| Geo/gateway/token API (~140 routes) | 16–17 |
| Handler integration tests with mock AppState | 16 |

---

## Recommended Task 16 priorities

1. Billing lifecycle routes (`start-trial`, `activate`, checkout)
2. Geo/AOI read routes with plan gates
3. Static asset + SPA fallback middleware
4. Axum handler integration tests (mock composition)
5. Policy admin HTTP routes wired to activate + reload

**Next:** Task 16 — billing lifecycle + geo route band.
