# Express role → permission MATRIX

Source: [`backend/server/rbac/permissions.js`](../backend/server/rbac/permissions.js) — `MATRIX` object.

Companion to [permission-slug-matrix.md](./permission-slug-matrix.md) (slug → Resource+Action).  
This document is the **Task 10 seed spec** for role-permission join rows.

**Rule:** Runtime Rust should read `Role.permissions` from DB — not hardcode MATRIX in authorization middleware.  
JWT carries `roleSlug` only; see [jwt-role-membership-bridge.md](./jwt-role-membership-bridge.md).

**Status (audit #6):** DB seed ✅; `PostgresRoleRepository` + `role_loader` load from `rbac_*` with static MATRIX fallback when unseeded. Strict path: `try_load_role_by_slug` for JWT (Task 12).

## Roles (normalized slugs)

| Slug | Display (Express) | Rank |
|------|-------------------|------|
| `trial_user` | Trial User | 6 |
| `viewer` | Viewer | 14 |
| `user` | User (legacy → viewer) | 14 |
| `ai_operator` | AI Operator | 18 |
| `analyst` | Analyst | 20 |
| `manager` | Manager | 30 |
| `admin` | Admin | 40 |
| `owner` | Owner | 50 |
| `super_admin` | Super Admin (legacy → owner) | 50 |

## Full MATRIX

| Role slug | Permission slugs |
|-----------|------------------|
| `trial_user` | `app.access`, `aoi.read` |
| `viewer` | `app.access`, `aoi.read`, `admin.panel`, `admin.users.read` |
| `user` | *(same as viewer)* |
| `analyst` | `app.access`, `aoi.read`, `aoi.write`, `analytics.run`, `reports.write`, `admin.panel`, `admin.users.read`, `admin.audit.read` |
| `ai_operator` | `app.access`, `aoi.read`, `analytics.run`, `ai.run`, `admin.panel`, `admin.users.read` |
| `manager` | analyst set + `admin.users.manage`, `admin.users.approve`, `admin.users.suspend`, `admin.invites.create` |
| `admin` | manager set + `admin.roles.assign`, `admin.settings.manage`, `admin.tokens.read`, `ai.run` |
| `owner` | **all 17** slugs in `PERMISSIONS` |
| `super_admin` | **all 17** slugs *(legacy alias of owner)* |

## Owner / super_admin — all permissions

```
app.access
admin.panel
admin.users.read
admin.users.manage
admin.users.approve
admin.users.suspend
admin.roles.assign
admin.invites.create
admin.audit.read
admin.settings.manage
admin.tokens.read
admin.tokens.manage
aoi.read
aoi.write
analytics.run
reports.write
ai.run
```

## Task 10 seed steps ✅

1. Insert 17 rows into `rbac_permissions` (slug column only).
2. Insert 8 canonical roles per tenant (`rbac_roles` with `{tenant}:{slug}` id).
3. For each `(role_slug, permission_slug)` in this matrix, insert `rbac_role_permissions` join row.
4. Verify: `cargo test -p infrastructure --test role_permission_matrix_seed -- --ignored` (requires Postgres).

**Not yet done:** Express `permissionsMatrixExport()` JSON parity (Task 16 golden tests).

## Verification (Task 10 ✅)

```bash
DATABASE_URL=postgres://... cargo test -p infrastructure --test role_permission_matrix_seed -- --ignored
```

Seed is **not** auto-run by `run_migrations()` — call `seed_default_tenant_matrix()` from dev bootstrap (Task 11).

## Notes

- Route-level checks may further restrict permissions (e.g. `admin.tokens.manage` owner-only in Express routes).
- `user` and `super_admin` are deprecated labels; seed **viewer** and **owner** rows; normalize aliases at JWT load per [jwt-role-membership-bridge.md](./jwt-role-membership-bridge.md).
