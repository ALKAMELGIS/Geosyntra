# Pre-Task 17 audit #11 (Tasks 0–16)

**Branch:** `feature/axum-migration`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (185 pass, 3 ignored) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–15** | ✅ | Unchanged from audit #10 |
| **16 Billing lifecycle** | ✅ | start-trial + activate routes |
| **17 Nix deploy** | ✅ | flake + deploy-rs Hostinger VPS profile |

**Safe to continue Task 18** (parity gate).

---

## Task 16 delivered

1. **Subscription writes** — `start_trial`, `activate_plan` on `SubscriptionRepository` + Postgres
2. **Use cases** — `StartBillingTrialUseCase`, `ActivateBillingPlanUseCase`
3. **Routes** — `POST /api/billing/start-trial`, `POST /api/billing/activate`
4. **RBAC mapping** — `billing.update` → `app.access`

---

## Task 17 delivered

1. **flake.nix** — deploy-rs, `geosyntra-api` package, deploy node, devShell deploy CLI
2. **nix/** — packages, deploy-hostinger profile, optional NixOS module
3. **scripts/install-nix-hostinger.sh** — Ubuntu VPS Nix layer bootstrap
4. **API bind** — `GEOSYNTRA_BIND_HOST` for VPS (`0.0.0.0:3001`)
5. **Docs** — `migration/nix-deploy-hostinger.md`, `migration/axum-migration-plan.md`

---

## Still deferred

| Item | Task |
|------|------|
| Golden parity tests | 18 |
| Stripe checkout / payment-intent | 18+ |
| Geo/AOI routes | 18–19 |
| Full Stripe webhook | 18+ |
| Production cutover | 25 |

---

## Recommended Task 18 priorities

1. Express vs Axum golden-file parity harness
2. Staging deploy to Hostinger `:3003` via deploy-rs
3. Billing checkout routes
4. Static asset middleware
5. Handler integration tests with mock AppState

**Next:** Task 18 — parity gate.
