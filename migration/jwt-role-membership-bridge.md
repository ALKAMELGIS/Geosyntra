# JWT `roleSlug` → `Membership` bridge

Design for Task 5a (`SubjectContext`) and Task 9 (auth middleware). Express today embeds a **single role slug** in JWT access tokens; domain `Membership` holds a **`HashSet<RoleId>`** for multi-role future.

## Express today

Source: [`backend/server/rbac/roles.js`](../backend/server/rbac/roles.js), JWT payload from login handlers.

| JWT claim | Example | Notes |
|-----------|---------|-------|
| `sub` | `"42"` | User id |
| `roleSlug` | `"admin"` | Normalized slug via `normalizeRbacRole()` |
| `tenantId` | optional | Multi-tenant when present |

Canonical slugs (8 roles):

| Slug | Display label | Rank |
|------|---------------|------|
| `owner` | Owner | 50 |
| `super_admin` | Super Admin | 50 (legacy → owner semantics) |
| `admin` | Admin | 40 |
| `manager` | Manager | 30 |
| `analyst` | Analyst | 20 |
| `ai_operator` | AI Operator | 18 |
| `viewer` | Viewer | 14 |
| `trial_user` | Trial User | 6 |

Public signup default: `trial_user` ([`PUBLIC_SIGNUP_ROLE_SLUG`](../backend/server/rbac/roles.js)).

## Target Rust flow (Task 5a)

```
JWT verified (interface/middleware)
  → extract user_id, tenant_id, role_slug
  → RoleRepository::find_by_slug(tenant_id, role_slug) → RoleId
  → MembershipRepository::find(user_id, tenant_id)
       OR synthesize Membership { roles: { role_id }, ... } when membership row missing
  → SubjectContext { membership, user, grants, subscription, ... }
```

### Phase 1 — single role (parity)

- JWT carries one `roleSlug`.
- Bridge builds effective membership: `HashSet::from([resolved_role_id])`.
- If DB membership exists with multiple roles, **union** JWT role with stored roles only when JWT is authoritative for session (match Express: JWT role is source of truth for current session).

Express behavior: token role reflects login-time assignment; no multi-role in JWT. **Parity rule:** use JWT slug as sole role in `SubjectContext` for authorization unless membership table explicitly loaded and merged per product decision.

**Recommended parity rule:** `SubjectContext` roles = DB membership roles if row exists; else `{ RoleId from JWT slug }`. Task 5a test against Express `/api/auth/me` role field.

### Phase 2 — multi-role (future)

- JWT may carry `roleSlugs: string[]` or omit roles entirely.
- Load full `Membership.roles` from DB.
- JWT optional hint for active role / UI only.

## Slug → `RoleId` mapping

Infrastructure seed (Task 10) inserts roles with stable UUIDs and slug column:

```sql
CREATE TABLE roles (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    slug        TEXT NOT NULL,  -- normalized: admin, viewer, ...
    name        TEXT NOT NULL,  -- display label
    UNIQUE (tenant_id, slug)
);
```

Lookup: `SELECT id FROM roles WHERE tenant_id = $1 AND slug = $2`.

Domain `RoleId` wraps UUID string; slug normalization replicates `normalizeRbacRole()` in Rust (Task 5a helper in application or infrastructure).

## Legacy aliases

Map before lookup (same as Express):

| Input | Normalized slug |
|-------|-----------------|
| `super_admin`, `superadmin`, `super` | `super_admin` |
| `user` | `viewer` |
| `editor` | `analyst` |
| `admin_manager`, `admin-manager` | `manager` |
| empty / unknown | `trial_user` |

## Permissions vs roles

- JWT does **not** carry permission slugs.
- Permissions resolved via `Role.permissions` (+ temporary grants) in `SubjectContext`.
- Plan gates (`ai.run`, exports) use [`Subscription::gate_feature`](../packages/domain/src/billing/subscription.rs) separately from RBAC (Task 5b two-phase auth).

## Static MATRIX seed

Role → permission assignments come from Express `MATRIX` at seed time only. See [persistence-permission-boundary.md](./persistence-permission-boundary.md).

## Tests (Task 5a)

- Each of 8 slugs normalizes and resolves to `RoleId` fixture.
- `trial_user` signup path matches `resolveSignupRole()` blocked/allowed sets.
- `canAssignRole(actor, target)` port as application policy (not domain).

## Out of scope here

- JWT signing / verification (infrastructure)
- Refresh token rotation
- OAuth provider role mapping
