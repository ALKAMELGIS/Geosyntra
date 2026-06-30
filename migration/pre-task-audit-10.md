# Pre-Task 11 audit #5 (Tasks 0–10)

> **Superseded by** [pre-task-audit-11.md](./pre-task-audit-11.md) (Tasks 0–11 @ `4d6a435e`). C1 and several HIGH items were resolved in Task 11.

**Branch:** `feature/axum-migration` @ `6ce9361d`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (~166 tests) + clippy `-D warnings` — **pass**

## Executive verdict

| Band | Verdict | Summary |
|------|---------|---------|
| **0–3 Domain** | ✅ Pass | Slugs 17/17, billing evaluate, no outer deps, Report removed |
| **4–7 Application core** | ✅ Pass | Ports/projectors, RBAC bridge, membership/lifecycle |
| **8 Application features** | ⚠️ Partial | Auth/billing/audit/invite done; gateway/geo/token API deferred |
| **9 Infrastructure sqlx** | ⚠️ Partial | 7 core repos; Role/Tenant/Billing/InvitedUserCreator missing |
| **10 Infrastructure adapters** | ⚠️ Partial | MATRIX seed, JWT/bcrypt, auth repos, M1 txn; runtime still static MATRIX |

**System blockers before production cutover:** see **CRITICAL** and **HIGH** below.  
**Safe to start Task 11** with fixes tracked — no regressions in Tasks 0–7.

---

## Per-task verdict

| Task | Verdict | Commit / notes |
|------|---------|----------------|
| **0** Workspace | ✅ | 6 crates, route inventory |
| **1** Domain remediation | ✅ | Report removed, PermissionSlug, no DerefMut |
| **2** Domain behavior | ✅ | User/Membership/Role transitions |
| **2b** Slug matrix | ✅ | 17/17 Express slugs |
| **3** GeoSyntra domain | ✅ | Billing + evaluate + design docs |
| **4–4b** Application port | ✅ | tenant_id, SubjectContext rename |
| **5a–5c** Auth engine | ⚠️ | RBAC bridge works; **stored ABAC chain broken (C1)** |
| **6–6c** Ports/projection | ⚠️ | Pattern correct; **M3 wiring incomplete (H2)** |
| **6b** Policy port | ✅ | Port + Postgres impl exist |
| **7** Membership/lifecycle | ✅ | `ab5f84d8` |
| **8** Auth/billing/audit/invite | ⚠️ | `e9c19e66` — gateway/geo/token API **not** in scope delivered |
| **9** Sqlx repos | ⚠️ | `ae982b74`, `4c1d350a` — H3 partial; Role/Tenant repos missing |
| **10** Adapters/seed | ⚠️ | `6ce9361d` — seed + crypto; email/OAuth deferred; runtime MATRIX hardcoded |

---

## CRITICAL — affects authorization model

### C1. Stored ABAC policies never evaluated

**Files:** `packages/application/src/authorization/engine.rs`, `policys/rbac_permission.rs`

`AuthorizationEngine::evaluate` returns on the **first** policy that returns `Some(decision)`.
`RbacPermissionPolicy` always returns `Some(Allow | Deny)` for mapped use-case pairs — it never
returns `None` to defer. Policies registered via `register_stored_policies` / `with_stored_policies`
sit **after** RBAC in the chain and are **never reached**.

`ApplicationStoredPolicy.priority` is stored but **not used** in evaluation order.

**Impact:** Task 6b/9/10 policy versioning and DB-backed ABAC cannot affect runtime until fixed.  
**Fix task:** **11a** (before Task 15 composition root) — RBAC returns `None` when no opinion, or
evaluate stored policies first with priority sort; add regression test.

---

## HIGH — missing features affecting system behavior

| ID | Issue | Task fix |
|----|-------|----------|
| **H2-full** | Handler-level `tenant_id` on loaded resources | 12 |
| **H3** | `CreateUserUseCase` requires `input.id`; `next_user_id()` only on register path | 11 |
| **H5** | `GetAuthMeUseCase` computes field access but returns raw `PublicUserView` (no projector) | 11 |
| **H6** | M3 self-read: only `GetUserById` + `GetAuthMe` set `with_target_user_id` | 11 |
| **H7** | No `PostgresRoleRepository` — role CRUD use cases have no infra adapter | 11 |
| **H8** | Runtime roles built from static `authz/matrix.rs`, not DB (`role-permission-matrix.md` rule violated) | 11 |
| **H9** | `AcceptInviteUseCase` needs `InvitedUserCreator` — no impl | 11 |
| **H10** | `GetBillingMeUseCase` needs `SubscriptionRepository` + `BillingPlanCatalog` — no impl | 11 |
| **H11** | JWT → `SubjectContext` bridge needs `RoleRepository::find_by_slug` — no impl | 12 (with extractors) |

---

## MEDIUM — doc drift / design gaps

| ID | Issue | Task fix |
|----|-------|----------|
| **M1** | Policy activate txn | ✅ Done Task 10 |
| **M2** | Postgres migration 008 on existing deploys | 9 ✅ (in 001_platform_schema) |
| **M3** | Self-read field logic in `field_sets.rs` ✅; wiring incomplete | 11 |
| **M4** | `load_active_policies` not called from composition root | 15 |
| **M5** | Schema uses `rbac_*` tables + TEXT keys vs doc `permissions` UUID model | Doc updated; optional rename later |
| **M6** | MATRIX seed not auto-run in `run_migrations()` | 11 or dev bootstrap script |
| **M7** | No `ApplicationStoredPolicy` seed from MATRIX (only `rbac_*` join tables) | 15 or 11 |
| **M8** | `ActivatePolicyVersionUseCase` uses `ACTION = "update"` not `"activate"` | 11 (observability) |
| **M9** | Write-path field ABAC: `writable_fields` always empty | 14+ when needed |
| **M10** | Task 8 plan listed gateway/geo/token API — deferred to Task 11+ | Plan updated |
| **M11** | Audit/invite repos global (no `SubjectContext`) — matches Express single-tenant admin tables | Documented; revisit for multi-tenant |
| **M12** | Domain `*/fields.rs` duplicates application projection fields | 11 cleanup |

---

## LOW — deferred / acceptable

| Item | Notes |
|------|-------|
| Public use cases skip authorize | Login, Register, Refresh, ListBillingPlans, Preview/Accept invite — intentional |
| `#![allow(dead_code)]` on stubs | Until Task 12 handlers wired |
| Email/OAuth adapters | Task 10 deferred → 11+ |
| Express JSON export parity for MATRIX | Task 16 golden tests |
| System-role mutation guards on `Role` | Domain quality (R1) |
| `user_repository` insert hardcodes `role = 'viewer'` | Align with membership model in 11 |

---

## Anti-pattern grep

| Pattern | Result |
|---------|--------|
| `*Privilege` / `FieldProfile` | None in source |
| `raw_query` | None in application ports |
| `tenet_id` / `TenetId` | None in source |
| Infra imports in application | None |
| Domain imports outer layers | None |

---

## Clean Architecture / auth model recheck

See [`clean-architecture-guidelines.md`](./clean-architecture-guidelines.md) for the canonical reference.

| Concept | Status |
|---------|--------|
| Dependency rule (inward only) | ✅ Strong |
| Domain = aggregates + invariants | ✅ |
| Application = use cases + ports + projection | ✅ |
| Infrastructure = port adapters | ⚠️ Gaps on Role/billing/invite accept |
| **Two-phase auth** (action RBAC + field projection) | ⚠️ Phase 2 incomplete on auth/me |
| **RBAC** (role → permission via SubjectContext) | ✅ Runtime bridge works |
| **ABAC** (stored policies + attributes) | ❌ Chain broken (C1); attrs wired in UCs |
| **Billing gates** (plan vs permission) | ✅ Domain; infra repos missing |
| **Projection** (`*View` + `AccessControl`) | ✅ User/role/membership reads; gap on PublicUserView |
| **Express slug boundary** | ✅ Domain PermissionSlug; infra seed uses slugs |

---

## Task 8 scope reconciliation

**Plan originally:** auth, billing, tokens, gateway, geo/gis, audit/invites.

**Delivered (`e9c19e66`):**

| Area | Use cases | Status |
|------|-----------|--------|
| Auth | Login, Register, Refresh, GetAuthMe | ✅ |
| Billing | ListPlans, GetBillingMe | ✅ ports only |
| Audit | ListAuditLog | ✅ |
| Invite | Create, List, Preview, Accept | ✅ |

**Deferred → Task 11+:**

- Gateway proxy use cases
- Geo/GIS/AOI use cases
- User API token / system token use cases (distinct from auth refresh JWT)
- OAuth login flows

---

## Task 9–10 infrastructure inventory

| Port | Postgres impl | Status |
|------|---------------|--------|
| UserRepository | ✅ | |
| MembershipRepository | ✅ | |
| PolicyRepository | ✅ + atomic activate | |
| AuditRepository | ✅ | |
| InviteRepository | ✅ | |
| AuthDirectoryRepository | ✅ | |
| RefreshTokenRepository | ✅ | |
| PasswordHasher / TokenIssuer | ✅ bcrypt + JWT | |
| RoleRepository | ❌ | **Task 11** |
| TenantRepository | ❌ | **Task 11** |
| SubscriptionRepository | ❌ | **Task 11** |
| BillingPlanCatalog | ❌ | **Task 11** |
| InvitedUserCreator | ❌ | **Task 11** |

---

## Recommended fix order (Task 11)

1. **C1** — Fix authorization engine policy chain (ABAC must be reachable).
2. **H7 + H8** — `PostgresRoleRepository` loading `rbac_*` + slug → domain mapping at boundary.
3. **H9 + H10** — Billing + invite-accept orchestration adapters.
4. **H3 + H5 + H6** — UserId allocator port; self-read projection on auth/me and email/username reads.
5. **M6** — Dev bootstrap: migrate + seed MATRIX (+ optional policy seed).

---

## Doc updates applied (this audit)

- [`clean-architecture-guidelines.md`](./clean-architecture-guidelines.md) — new
- [`rbac-use-case-mapping.md`](./rbac-use-case-mapping.md) — status + C1 note
- [`persistence-permission-boundary.md`](./persistence-permission-boundary.md) — actual `rbac_*` schema
- [`role-permission-matrix.md`](./role-permission-matrix.md) — seed vs runtime status
- Migration plan — tasks 8–10 status, risk register, Task 11 scope

**Next:** Task 11 with C1 as first deliverable.
