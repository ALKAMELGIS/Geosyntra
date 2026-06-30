# Persistence boundary — permission slugs

Design for Task 9 (sqlx) / Task 10 (seed). Domain keeps [`Resource`](../packages/domain/src/value_objects/resource.rs) + [`Action`](../packages/domain/src/value_objects/action.rs) internally; Express-compat slugs are stored and mapped at the infrastructure boundary.

## Principle

| Layer | Type | Responsibility |
|-------|------|----------------|
| PostgreSQL | `TEXT slug` | Store dotted Express slug verbatim (e.g. `admin.users.read`) |
| Infrastructure repo | `PermissionSlug` | Parse slug on load via `PermissionSlug::to_resource_action()` |
| Domain | `Permission` | Hold `Resource` + `Action` + metadata; no slug field on aggregate |
| Application | `SubjectContext` | Evaluate permissions from domain `Permission` set |
| Interface / JWT | slug strings | Legacy JWT claims may carry role slugs only (see [jwt-role-membership-bridge.md](./jwt-role-membership-bridge.md)) |

## Schema (implemented — Task 10)

Actual PostgreSQL tables (Express-compat, tenant-scoped):

```sql
CREATE TABLE rbac_permissions (
    slug        TEXT PRIMARY KEY,   -- Express PERMISSIONS key
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE rbac_roles (
    id          TEXT PRIMARY KEY,   -- '{tenant_id}:{role_slug}'
    tenant_id   TEXT NOT NULL,
    slug        TEXT NOT NULL,
    display_name TEXT NOT NULL,
    UNIQUE (tenant_id, slug)
);

CREATE TABLE rbac_role_permissions (
    role_id         TEXT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
    permission_slug TEXT NOT NULL REFERENCES rbac_permissions(slug) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_slug)
);
```

Migration: [`20250614000004_rbac_permissions.sql`](../packages/infrastructure/migrations/20250614000004_rbac_permissions.sql).

**Design doc note:** Early draft used UUID `permissions` / `role_permissions` names. Implemented schema uses `rbac_*` prefix and slug-as-key for Express parity and simpler seeding.

**Load path (target — Task 11):**

1. Read `rbac_permissions.slug` (or join via `rbac_role_permissions`).
2. `PermissionSlug::new(slug)?` then `to_resource_action()?`.
3. Construct domain `Permission { resource, action, ... }` in `RoleRepository` adapter.

**Current gap (audit #6):** Runtime `load_role_by_slug` tries DB first, falls back to static `authz/matrix.rs` when unseeded. JWT bridge should use `try_load_role_by_slug` (strict DB) in Task 12 extractors. Require `./scripts/dev-bootstrap.sh` in dev.

## Alias handling

Slugs in [`SLUG_ALIASES`](../packages/domain/src/value_objects/permission_slug.rs) (`ai.run`, `admin.panel`) are stored **as Express slugs** in DB. Mapping happens only at load via domain `PermissionSlug`.

Full matrix: [permission-slug-matrix.md](./permission-slug-matrix.md).  
Role assignments: [role-permission-matrix.md](./role-permission-matrix.md).

## Role permissions vs static MATRIX

Express [`permissions.js`](../backend/server/rbac/permissions.js) `MATRIX` is **seed data** for Task 10, not runtime hardcoding in Rust:

- Seed script inserts 8 canonical roles + 17 permissions + join rows from MATRIX.
- Runtime authorization reads `Role.permissions` from DB (dynamic policy).

## Temporary grants

`temporary_grants` table stores `resource` + `action` as domain strings (already normalized), **or** optional `slug` column if grants are created from Express UI labels. Prefer normalized resource/action columns aligned with domain VOs; slug column is optional for audit display only.

## Tests

- [`permission_slug_matrix.rs`](../packages/domain/tests/permission_slug_matrix.rs) — 17/17 Express slugs
- [`role_permission_matrix_seed.rs`](../packages/infrastructure/tests/role_permission_matrix_seed.rs) — seed counts per role (`#[ignore]`, needs Postgres)
- Task 11 integration: round-trip slug → DB load → `to_resource_action()` for every seeded row (deferred)
- Task 12: integration tests for RoleRepository, SubscriptionRepository, InvitedUserCreator

## Implemented adapters (Task 11)

| Port | Impl |
|------|------|
| RoleRepository | `PostgresRoleRepository` |
| SubscriptionRepository | `PostgresSubscriptionRepository` (read) |
| BillingPlanCatalog | `ExpressBillingPlanCatalog` |
| InvitedUserCreator | `PostgresInvitedUserCreator` |
| UserIdAllocator | `PostgresUserIdAllocator` |

## Out of scope (Task 12+)

- TenantRepository
- Stripe / subscription **writes**
- Email / OAuth adapters
