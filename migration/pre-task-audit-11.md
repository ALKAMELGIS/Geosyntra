# Pre-Task 12 audit #6 (Tasks 0–11)

**Branch:** `feature/axum-migration` @ `4d6a435e`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (169 pass, 2 ignored) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–3 Domain** | ✅ Pass | Slugs 17/17, billing evaluate, no outer deps |
| **4–7 Application core** | ✅ Pass | Ports, projectors, RBAC bridge, lifecycle |
| **8 Features** | ⚠️ Partial | Auth/billing/audit/invite; gateway/geo/token API deferred |
| **9–10 Infra core** | ✅ Pass | Pool, migrations, 7 core repos, MATRIX seed, JWT/bcrypt |
| **11 Feature repos** | ⚠️ Partial | C1 fixed, role/billing/invite adapters; tenant/geo/email gaps remain |

**No CRITICAL authorization-model blockers.** Safe to start **Task 12** (interface shell) with tracked HIGH items below.

---

## Per-task verdict

| Task | Verdict | Commit / notes |
|------|---------|----------------|
| **0** Workspace | ✅ | 6 crates, route inventory |
| **1** Domain remediation | ✅ | Report removed, PermissionSlug |
| **2–2b** Domain behavior + slugs | ✅ | 17/17 Express slugs |
| **3** GeoSyntra domain | ✅ | Billing evaluate + design docs |
| **4–4b** Application port | ✅ | `tenant_id`, SubjectContext |
| **5a–5c** Auth engine | ✅ | RBAC bridge; **C1 fixed Task 11** |
| **6–6c** Ports/projection | ⚠️ | Pattern correct; M3 + GetAuthMe gaps |
| **6b** Policy port | ✅ | Port + Postgres impl, M1 txn |
| **7** Membership/lifecycle | ✅ | `ab5f84d8` |
| **8** Auth/billing/audit/invite | ⚠️ | `e9c19e66` — 37 use cases; gateway/geo/token API deferred |
| **9** Sqlx core | ✅ | `ae982b74`, `4c1d350a` |
| **10** Adapters/seed | ✅ | `6ce9361d` — MATRIX, JWT/bcrypt, auth repos |
| **11** Feature repos | ⚠️ | `4d6a435e` — see resolved vs open below |

---

## Resolved since audit #5

| ID | Item | Status |
|----|------|--------|
| **C1** | Stored ABAC unreachable (RBAC short-circuit) | ✅ Task 11 — stored policies evaluate before RBAC fallback |
| **H7** | `PostgresRoleRepository` | ✅ Task 11 |
| **H9** | `InvitedUserCreator` | ✅ Task 11 |
| **H10** | `SubscriptionRepository` + `BillingPlanCatalog` | ✅ Task 11 (read-only subscription) |
| **H3** | `UserIdAllocator` port + infra | ✅ Task 11 — composition must wire `.with_id_allocator()` |
| **H6** | M3 `with_target_user_id` | ⚠️ Partial — 4 read paths (id, me, email, username) |
| **M6** | Dev bootstrap seed | ✅ `scripts/dev-bootstrap.sh` + `bootstrap()` |

---

## HIGH — affects system behavior (open)

| ID | Issue | Task fix |
|----|-------|----------|
| **H5** | `GetAuthMeUseCase` computes `_access` but returns raw `PublicUserView` — no projector | 12 or 11b |
| **H12** | `PostgresUserRepository::insert` hardcodes `role = 'viewer'` — admin create ignores intended role | 12 |
| **H13** | `RegisterUseCase` writes `admin_users` only — no `memberships` row (invite accept does) | 12 |
| **H8** | Role load DB-first with static MATRIX fallback when unseeded (`load_role_by_slug`) | 12 bootstrap + strict mode optional |
| **H2-full** | Resource `tenant_id` from loaded entity — handlers/extractors | 12 |
| **H11** | JWT → `SubjectContext` needs `RoleRepository::load_role_by_slug` in extractors | 12 |
| **H14** | `TenantRepository` port has no Postgres impl | 12 or 11b |
| **H3-wire** | `CreateUserUseCase` requires explicit `.with_id_allocator()` at composition root | 15 |

---

## MEDIUM — doc / design gaps

| ID | Issue | Task fix |
|----|-------|----------|
| **M3** | Self-read not on `UpdateUserUseCase` / list per-row | 12 |
| **M4** | `load_active_policies` not called from composition root | 15 |
| **M9** | Subscription repo read-only — no plan/trial writes | 14+ |
| **M10** | Email/OAuth adapters deferred since Task 10 | 14+ |
| **M11** | Gateway/geo/token API use cases deferred from Task 8 | 14+ |
| **M12** | Role write path skips `normalize_rbac_role` on slug | 12 |
| **M13** | `user_repository` read path omits `admin_users.role` column | 12 |
| **M14** | No integration tests for Task 11 adapters (role, subscription, invite accept) | 12 |
| **M8** | `ActivatePolicyVersionUseCase` uses `ACTION = "update"` | Low priority |

---

## LOW — acceptable / deferred

| Item | Notes |
|------|-------|
| Public use cases skip authorize | Login, Register, Refresh, billing catalog, invite preview/accept |
| `EventRepository` stub | No use cases yet |
| RBAC maps `membership.delete` without use case | Forward-compat |
| `#![allow(dead_code)]` on stubs | Until Task 12 handlers |
| Static MATRIX fallback | Dev safety net; require bootstrap in prod |

---

## Anti-pattern grep

| Pattern | Result |
|---------|--------|
| `*Privilege` / `FieldProfile` | None in source |
| `raw_query` | None in application ports |
| `tenet_id` / `TenetId` | None in source |
| Infra in application | None |

---

## Clean Architecture / auth model recheck

See [`clean-architecture-guidelines.md`](./clean-architecture-guidelines.md).

| Concept | Status (post–Task 11) |
|---------|------------------------|
| Dependency rule | ✅ Strong |
| Two-phase auth (action + fields) | ⚠️ GetAuthMe skips phase-2 apply |
| RBAC (`SubjectContext` + bridge) | ✅ |
| ABAC (stored policies) | ✅ Chain fixed; **runtime load** Task 15 |
| Billing gates (domain) | ✅ Domain; subscription **read** infra ✅ |
| Projection (`*View` + `AccessControl`) | ⚠️ User/role/membership ✅; `PublicUserView` ❌ |
| Express slug boundary | ✅ `PermissionSlug` + `rbac_*` tables |
| Three checks separate | ✅ RBAC / ABAC / billing documented |

### Authorization engine order (post–C1 fix)

```text
1. guard_policies
2. dynamic_policies (tenant isolation, test AllowAll)
3. stored_policies (ABAC, priority desc)
4. RbacPermissionPolicy (fallback)
5. Deny
```

Regression tests: `packages/application/src/authorization/engine.rs` (`stored_policy_*`).

---

## Use-case inventory

**37/37** implement `UseCaseDescriptor`. **33/33** descriptor `(RESOURCE, ACTION)` pairs map in `rbac_mapping.rs`.

| Auth pattern | Count |
|--------------|------:|
| Full two-phase + projector | ~24 |
| Phase 1 only | 10 |
| Public (no authorize) | 6 |
| Phase 2 computed, not applied | 1 (`GetAuthMe`) |

---

## Infrastructure port matrix (Task 11)

| Port | Impl | Status |
|------|------|--------|
| UserRepository | PostgresUserRepository | ✅ |
| UserIdAllocator | PostgresUserIdAllocator | ✅ |
| RoleRepository | PostgresRoleRepository | ✅ |
| MembershipRepository | PostgresMembershipRepository | ✅ |
| PolicyRepository | PostgresPolicyRepository | ✅ |
| AuditRepository | PostgresAuditRepository | ✅ |
| InviteRepository | PostgresInviteRepository | ✅ |
| InvitedUserCreator | PostgresInvitedUserCreator | ✅ |
| AuthDirectoryRepository | PostgresAuthDirectoryRepository | ✅ |
| RefreshTokenRepository | PostgresRefreshTokenRepository | ✅ |
| PasswordHasher / TokenIssuer | bcrypt + JWT | ✅ |
| SubscriptionRepository | PostgresSubscriptionRepository | ⚠️ read-only |
| BillingPlanCatalog | ExpressBillingPlanCatalog | ✅ static |
| **TenantRepository** | — | ❌ |
| **EventRepository** | — | ❌ |
| Email / OAuth | — | ❌ deferred |

---

## Task 11 scope reconciliation

**Delivered (`4d6a435e`):** C1 engine fix, PostgresRoleRepository, role_loader, billing read adapters, InvitedUserCreator, UserIdAllocator, self-read on email/username, dev bootstrap.

**Deferred → Task 12+:** TenantRepository, GetAuthMe projection, register membership wiring, user insert role fix, gateway/geo/token API, email/OAuth, subscription writes, strict DB-only roles.

---

## Recommended Task 12 priorities

1. Interface shell: `AppError` JSON, `SubjectContext` + `Environment` extractors
2. JWT → `load_role_by_slug` + membership load for `SubjectContext`
3. Handler-level `with_resource_tenant_id` from loaded resources (H2 full)
4. Fix H12/H13 (user role on create, register membership) before auth routes go live
5. Optional: GetAuthMe projection or document Express `PublicUserView` parity

---

## Doc updates (this audit)

- [`pre-task-audit-11.md`](./pre-task-audit-11.md) — this file
- [`clean-architecture-guidelines.md`](./clean-architecture-guidelines.md) — C1 resolved, engine order
- [`rbac-use-case-mapping.md`](./rbac-use-case-mapping.md) — M3/C1 status
- [`persistence-permission-boundary.md`](./persistence-permission-boundary.md) — Task 11 runtime status
- Migration plan — Task 11 partial, audit #6, Task 12 scope

**Next:** Task 12 — interface shell + JWT/membership bridge.
