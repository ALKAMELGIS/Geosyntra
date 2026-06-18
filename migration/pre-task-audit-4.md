# Pre-Task 8 audit #4 (Tasks 0–7)

**Branch:** `feature/axum-migration` @ `ab5f84d8`  
**Date:** 2026-06-14  
**Verification:** `cargo test --workspace` (152 tests) + clippy `-D warnings` — **pass**

## Per-task verdict

| Task | Verdict | Notes |
|------|---------|-------|
| 0–3 Domain | ✅ | Slug matrix 17/17; billing evaluate; no Report |
| 4–4b Application | ✅ | `tenant_id`; list bug fixed |
| 5a–5c Auth | ✅ | RBAC bridge; tenant isolation tests |
| 6–6c Ports/projection | ✅ | `15af47d4`; privilege tiers removed |
| 6b Policy port | ✅ | `acb57278`; migration 008 |
| 7 Membership/lifecycle | ✅ | `ab5f84d8`; 4 membership UC; approve/suspend/reactivate/set_role |

## Anti-pattern grep

| Pattern | Result |
|---------|--------|
| `*Privilege` / `FieldProfile` | None |
| `raw_query` | None in application ports |
| `tenet_id` / `TenetId` | None in source (git history only) |

## Gaps (deferred — not blockers for Task 8)

| ID | Item | Task |
|----|------|------|
| H2 | Handler-level resource tenant (full isolation) | 12 |
| H3 | DB-generated `UserId` | 9 |
| M1 | Policy activate transaction | 10 |
| M2 | Run migration 008 on existing Postgres | 9 |
| M4 | Runtime policy load in composition root | 15 |
| — | `TenantRepository` read/write split | 9+ |
| — | `PolicyRepository` sqlx impl | 9–10 |
| — | `#![allow(dead_code)]` on stub crates | Until handlers wired |

## Doc fix applied

- [`rbac-use-case-mapping.md`](rbac-use-case-mapping.md): lifecycle routes marked **Done (Task 7)**; membership mappings documented.

## Task 8 scope confirmed

Auth, billing, tokens, gateway, geo/gis use cases; audit/invite RBAC parity; self-read field policy (M3).
