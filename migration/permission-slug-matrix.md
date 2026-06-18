# Express permission slug matrix

Source: [`backend/server/rbac/permissions.js`](../backend/server/rbac/permissions.js) — `PERMISSIONS` object (17 slugs).

Domain mapping: [`packages/domain/src/value_objects/permission_slug.rs`](../packages/domain/src/value_objects/permission_slug.rs) — `PermissionSlug::to_resource_action()`.

**Rule:** Mechanical split = last segment → `Action`, prior segments joined with `_` → `Resource`.  
**Aliases** apply when mechanical split violates `Resource`/`Action` VOs or Express semantics.

## Full matrix

| Express slug | Resource | Action | Mapping |
|--------------|----------|--------|---------|
| `app.access` | `app` | `access` | mechanical |
| `admin.panel` | `admin_panel` | `access` | **alias** — panel is a gate, not an action |
| `admin.users.read` | `admin_users` | `read` | mechanical |
| `admin.users.manage` | `admin_users` | `manage` | mechanical |
| `admin.users.approve` | `admin_users` | `approve` | mechanical |
| `admin.users.suspend` | `admin_users` | `suspend` | mechanical |
| `admin.roles.assign` | `admin_roles` | `assign` | mechanical |
| `admin.invites.create` | `admin_invites` | `create` | mechanical |
| `admin.audit.read` | `admin_audit` | `read` | mechanical |
| `admin.settings.manage` | `admin_settings` | `manage` | mechanical |
| `admin.tokens.read` | `admin_tokens` | `read` | mechanical |
| `admin.tokens.manage` | `admin_tokens` | `manage` | mechanical |
| `aoi.read` | `aoi` | `read` | mechanical |
| `aoi.write` | `aoi` | `write` | mechanical |
| `analytics.run` | `analytics` | `run` | mechanical |
| `reports.write` | `reports` | `write` | mechanical |
| `ai.run` | `ai_chat` | `run` | **alias** — `ai` is below Resource min length (3) |

## Aliases (`SLUG_ALIASES`)

```rust
("ai.run", "ai_chat", "run"),
("admin.panel", "admin_panel", "access"),
```

## Task 10 seed

When seeding Postgres from the Express `MATRIX`:

1. Insert each slug into `permissions.slug` (slug is the only persisted permission identifier).
2. Insert role rows with normalized `slug` (see [role-permission-matrix.md](./role-permission-matrix.md)).
3. Insert `role_permissions` join rows from the MATRIX — **do not** persist derived `resource`/`action` columns; map at load via `PermissionSlug::to_resource_action()` (see [persistence-permission-boundary.md](./persistence-permission-boundary.md)).
4. Use [role-permission-matrix.md](./role-permission-matrix.md) as the parity reference for [`permissionsMatrixExport()`](Geosyntra/backend/server/rbac/permissions.js).

## Verification

```bash
cargo test -p domain --test permission_slug_matrix
```

Tests must stay in sync with this document when slugs change in Express.
