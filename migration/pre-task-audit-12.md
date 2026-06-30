# Pre-Task 13 audit #7 (Tasks 0–12)

**Branch:** `feature/axum-migration`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (175 pass, 2 ignored) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–11 fixes** | ✅ | H5, H12, H13, M3, M12, M13, H14 resolved in Task 12 prep |
| **12 Interface** | ⚠️ Partial | Auth shell + JWT bridge; user/admin handlers Task 13+ |

**Safe to continue Task 13** (user/admin route handlers).

---

## Resolved in Task 12 prep (audit #6 items)

| ID | Fix |
|----|-----|
| **H5** | `PublicUserProjector` + phase-2 apply in `GetAuthMeUseCase` |
| **H12** | `UserWriteRepository::insert` accepts `role_display`; no hardcoded viewer |
| **H13** | Register path inserts `memberships` row in transaction |
| **H11** | `JwtSubjectContextResolver` + `AuthSubject` extractor |
| **H14** | `PostgresTenantRepository` |
| **M3** | `UpdateUserUseCase` + `ListUserUseCase` per-row self-read |
| **M12** | Role write normalizes slug via `normalize_rbac_role` |
| **M13** | `user_repository` reads `admin_users.role` into `UserView` |

---

## Task 12 delivered

1. **AppError JSON** — `interface::AppErrorResponse` (`error` + `code` fields)
2. **JWT → SubjectContext** — `SubjectContextResolver` port + `JwtSubjectContextResolver` (DB membership roles, JWT slug fallback)
3. **Environment extractor** — `RequestEnvironment` (neutral until geo headers wired)
4. **Auth routes** — `POST /api/auth/login|register|refresh`, `GET /api/auth/me`
5. **Composition root** — `geosyntra-api::build_app_state` + `build_router`

---

## Still deferred

| Item | Task |
|------|------|
| H3-wire `CreateUserUseCase.with_id_allocator()` at composition | 15 |
| M4 `load_active_policies` in composition | 15 |
| User/admin CRUD handlers + resource tenant from entity | 13–14 |
| Strict DB-only roles (no MATRIX fallback in prod) | 15 |
| Email/OAuth, gateway/geo/token API | 14+ |

**Next:** Task 13 — user/admin Axum handlers with `with_resource_tenant_id` from loaded entities.
