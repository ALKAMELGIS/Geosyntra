# Pre-Task 15 audit #9 (Tasks 0–14)

**Branch:** `feature/axum-migration`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (184 pass, 3 ignored) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–13 fixes** | ✅ | Unchanged from audit #8 |
| **14 RBAC + middleware** | ✅ | Audit/invites/matrix routes, CORS, auth rate limit, H2-full, policy load prep |

**Safe to continue Task 15** (runtime ABAC reload / remaining Express routes).

---

## Per-task verdict (0–14)

| Task | Verdict | Notes |
|------|---------|-------|
| **0–12** | ✅ | Unchanged from audit #8 |
| **13 RBAC users** | ✅ | User lifecycle handlers wired |
| **14 RBAC + middleware** | ✅ | See deliverables below |

---

## Task 14 delivered

1. **RBAC routes** — `GET /api/rbac/audit`, `GET/POST /api/rbac/invites`, public `GET …/preview`, `POST …/accept`, `GET /api/rbac/permissions/matrix`
2. **Middleware** — CORS (`APP_ORIGIN` + defaults), auth rate limit (120/15min on `/api/auth/*`)
3. **H2-full** — `find_tenant_for_user` port + `resolve_resource_tenant`; user lifecycle handlers pass loaded tenant
4. **Policy load prep** — async `build_app_state` calls `load_active_policies` → `AuthorizationEngine::with_stored_policies`
5. **Tests** — matrix export, resource tenant, CORS/rate-limit unit tests; M14 membership lookup integration test (ignored)

---

## New / updated artifacts

| Area | File |
|------|------|
| Matrix export | `application/src/rbac/matrix_export.rs` |
| Resource tenant | `application/src/authorization/resource_tenant.rs` |
| Use case | `ExportPermissionsMatrixUseCase` |
| Handlers | `interface/src/rbac/handlers.rs`, `invite_handlers.rs` |
| Middleware | `interface/src/middleware/cors.rs`, `auth_rate_limit.rs` |
| Composition | `api/src/lib.rs` — async state + invite/audit wiring |

---

## Still deferred

| Item | Task |
|------|------|
| M4 runtime policy reload on tenant switch | 15 |
| Email on invite create, dev invite link | 15+ |
| Stripe raw body, static files | 15+ |
| `/api/rbac/me` alias | optional |
| Admin create `password_hash` | 15+ |
| Gateway/geo/token API (~150 routes) | 15–16 |

---

## Clean Architecture recheck

| Concept | Status |
|---------|--------|
| Dependency rule | ✅ interface → application only |
| Two-phase auth | ✅ All wired RBAC handlers use use cases |
| H2-full tenant | ✅ Handlers resolve membership tenant before lifecycle ops |
| ABAC | ✅ Policies loaded at startup; hot reload Task 15 |
| Projection | ✅ User/invite JSON via mappers |

Engine order: guard → dynamic → stored ABAC → RBAC → deny.

---

## Recommended Task 15 priorities

1. Runtime `load_active_policies` refresh / per-tenant engine (M4 complete)
2. Remaining Express routes (billing webhooks, geo, tokens)
3. Handler integration tests with mock `AppState`
4. Email invite delivery parity
5. Static asset + Stripe raw-body middleware

**Next:** Task 15 — ABAC runtime + route expansion.
