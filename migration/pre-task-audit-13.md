# Pre-Task 14 audit #8 (Tasks 0–13)

**Branch:** `feature/axum-migration`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (177 pass, 2 ignored) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–12 fixes** | ✅ | Audit #6/#7 gaps closed (see below) |
| **13 RBAC users** | ⚠️ Partial | List/lifecycle/patch routes wired; audit/invites/middleware deferred |

**Safe to continue Task 14** (more routes + middleware).

---

## Per-task verdict (0–13)

| Task | Verdict | Notes |
|------|---------|-------|
| **0–11** | ✅ | Unchanged from audit #7 |
| **12 Interface shell** | ✅ | Auth routes, JWT bridge, AppError JSON, composition root |
| **13 RBAC users** | ⚠️ | `/api/rbac/users*` handlers; CORS/rate-limit → Task 14 |

---

## Resolved in audit #8 (Tasks 0–12 recheck)

| ID | Fix |
|----|-----|
| **M3 lifecycle** | `with_target_user_id` on suspend/approve/reactivate/delete |
| **Role projection** | `UserField::Role` / `RoleSlug` + projector masking |
| **Admin create membership** | `PostgresUserRepository::insert` txn + memberships row |
| **Profile persistence** | `save` updates `name`; `into_domain` loads profile from `name` |
| **H8 strict JWT** | `GEOSYNTRA_STRICT_RBAC` / production → fail closed without DB role |
| **H3-wire** | `CreateUserUseCase.with_id_allocator()` in `build_app_state` |
| **SetUserRole parity** | Updates membership + `admin_users.role` via `update_directory_role` |
| **Interface CA** | No infrastructure imports in `interface` crate |

---

## Task 13 delivered

1. **RBAC user handlers** — `GET /api/rbac/users`, `POST …/approve|suspend|reactivate`, `DELETE/PATCH …/:id`
2. **Composition expansion** — user lifecycle use cases + shared `AuthorizationEngine` + id allocator
3. **Express JSON shape** — `{ ok: true, users: [...] }` / `{ ok: true }`
4. **Patch role** — `SetUserRoleUseCase` + directory role sync (not `UpdateUserUseCase`)
5. **Application role slug** — `application::rbac::role_slug` (interface-safe, no infra dep)

---

## Still deferred

| Item | Task |
|------|------|
| H2-full multi-tenant resource tenant from loaded entity | 14 handlers (membership preload helper) |
| M4 `load_active_policies` in composition | 15 |
| CORS, rate limit, Stripe raw body, static files | 14 (plan middleware band) |
| `/api/rbac/audit`, invites, roles routes | 14 |
| Admin create password_hash | 14+ (auth directory path) |
| M14 Postgres integration tests for adapters | 14 |
| Email/OAuth, gateway/geo/token API | 14+ |

---

## Clean Architecture / auth model recheck

| Concept | Status |
|---------|--------|
| Dependency rule | ✅ interface → application only |
| Two-phase auth | ✅ All wired RBAC handlers use use cases |
| RBAC | ✅ SubjectContext + engine + mapping |
| ABAC | ✅ Chain fixed; runtime load Task 15 |
| Billing gates | ✅ Domain; subscription read infra |
| Projection | ✅ User/PublicUser projectors; role fields gated |
| Three checks separate | ✅ Documented |

Engine order: guard → dynamic → stored ABAC → RBAC → deny.

---

## Recommended Task 14 priorities (carry forward)

1. Remaining Express RBAC routes (audit, invites, roles matrix)
2. Middleware band (CORS, rate limit) per plan
3. H2-full helper: load membership tenant before user/membership handlers
4. Handler integration tests + M14 postgres adapter tests
5. `load_active_policies` prep in composition (Task 15 gate)

**Next:** Task 14 — route port + middleware.
