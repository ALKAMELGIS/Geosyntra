# Dioxus access control parity (Task 23.5)

**Goal:** On first API start, seed **Express-equivalent authorization** into Postgres (RBAC role matrix + active ABAC policy with **resource + action** rules) **per tenant**. Dioxus UI and Axum routes gate **dashboard, settings, admin, satellite** by **permissions within the active tenant** — not hardcoded `is_owner()`.

**Tenant rule:** Every protected surface is **tenant-scoped**. Cross-tenant reads/writes are denied by `TenantIsolationPolicy` + repository `WHERE tenant_id = $subject.tenant` (see [rbac-use-case-mapping.md](./rbac-use-case-mapping.md)).

**Express source:** `backend/server/rbac/permissions.js` (`PERMISSIONS`, `MATRIX`)  
**Rust seed:** `packages/infrastructure/src/authz/matrix.rs`, `matrix_seed.rs`  
**Slug → resource+action:** [permission-slug-matrix.md](./permission-slug-matrix.md)

**Index:** [dioxus-axum-plan.md](./dioxus-axum-plan.md) · [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md)

---

## Current state (2026-06-17) ✅

| Area | Status |
|------|--------|
| RBAC matrix in DB | Seeded by `bootstrap()` → `seed_default_tenant_matrix()` on every API cold start ✅ |
| Active ABAC policy | `seed_default_abac_policy()` creates + activates `express-baseline-v1` per tenant ✅ |
| Axum route guards | RBAC middleware + ABAC `ReloadableAuthorizationService` ✅ |
| Dioxus UI | `session.has_permission()` for admin/settings/satellite gates ✅ |
| JWT / `/api/rbac/me` | Returns `tenantId`, `permissions[]` for active tenant ✅ |
| Dioxus session | `AuthSession.tenant_id` + `permissions` from login/me ✅ |
| Tenant isolation (UI) | Admin lists scoped to active tenant; cross-tenant 403 in integration tests ✅ |
| JWT resolver | `tenantId` claim → `SubjectContext.tenant_id` ✅ |

---

## Task 23.5 iterations

| Iteration | Deliverable | Parity reference |
|-----------|-------------|------------------|
| **23.5.1** | `seed_default_abac_policy()` — create + **activate** policy version `express-baseline-v1` from MATRIX (resource+action rules per [permission-slug-matrix.md](./permission-slug-matrix.md)) | Express `permissions.js` |
| **23.5.2** | Call from `prepare_database()` after `seed_default_tenant_matrix()` — **idempotent** (skip if active version exists) | [role-permission-matrix.md](./role-permission-matrix.md) |
| **23.5.3** | `/api/rbac/me` + login response include `permissions: string[]` from role loader | React `readCurrentUser().permissions` |
| **23.5.4** | Dioxus `AuthSession::has_permission(slug)` + load permissions on session restore | `frontend/src/lib/rbacPermissions.ts` |
| **23.5.5** | Replace `is_owner()` gates with permission checks (see matrix below) | Express middleware + React nav |
| **23.5.6** | Integration test: trial_user denied `admin.users.manage`; manager allowed; owner all | Express route tests |
| **23.5.7** | Playwright: login as seeded roles → expect route allow/deny | Task 25 |
| **23.5.8** | JWT `tenantId` → `SubjectContext.tenant_id`; `/api/rbac/me` returns `tenantId` | [jwt-role-membership-bridge.md](./jwt-role-membership-bridge.md) |
| **23.5.9** | Dioxus `AuthSession.tenant_id`; permissions evaluated **for that tenant only** | Session restore via `/api/rbac/me` |
| **23.5.10** | Tenant-scoped UI: dashboard/settings/admin show tenant context; 403 → “wrong tenant” UX | `TenantIsolationPolicy` |
| **23.5.11** | ABAC + RBAC seed **per tenant** (`seed_rbac_matrix(pool, tenant_id)` + default policy per tenant) | `matrix_seed.rs` |
| **23.5.12** | Integration test: user in tenant A cannot mutate tenant B user (403) | Task 14 handlers |

---

## Permission → UI / route matrix (Dioxus)

Match Express + React — **not** owner-only unless Express is owner-only.

| Surface | Permission slug(s) | Express / React |
|---------|-------------------|-----------------|
| Platform entry (`app.access`) | `app.access` | Required for `/dashboard`, `/satellite/*` |
| Dashboard hub | `app.access` | Signed-in workspace entry |
| Settings shell | `app.access` | All signed-in users |
| Settings profile | `app.access` | All signed-in |
| API integrations | `admin.settings.manage` or `admin.tokens.read` | Owner/admin in React |
| Admin shell | `admin.panel` | Nav `canSeeAdmin` |
| Admin users | `admin.users.read` / `admin.users.manage` | Route + action buttons |
| Admin team / invites | `admin.invites.create` | Manager+ |
| Admin roles | `admin.roles.assign` | Admin+ |
| Admin audit | `admin.audit.read` | Analyst+ |
| Admin tokens | `admin.tokens.read` / `admin.tokens.manage` | Admin read; owner manage |
| Satellite / GeoAI | `app.access` + `aoi.read` | Protected routes; AOI data tenant-scoped |

**Route-level extra rules (preserve Express):** e.g. `admin.tokens.manage` remains owner-only in handler even if slug exists on admin role — document in policy seed comments.

---

## Tenant isolation — dashboard, settings, admin

Authorization is **two-dimensional**: `(tenant_id, permission_slug)`. A user may hold different roles in different tenants via `memberships(user_id, tenant_id, roles)`.

### Backend (Axum — mostly done)

| Mechanism | Behavior |
|-----------|----------|
| `SubjectContext.tenant_id` | Set from JWT / membership resolver |
| `TenantIsolationPolicy` | Deny when `resource_attributes.tenant_id ≠ subject.tenant_id` |
| Repositories | Policies, users, audit, invites filtered by `ctx.tenant_id()` |
| ABAC reload | `ReloadableAuthorizationService` loads **per-tenant** active policies |
| Role IDs | `{tenant_id}:{role_slug}` e.g. `geosyntra-default:manager` |

### Dioxus UI ✅

| Surface | Tenant isolation requirement |
|---------|------------------------------|
| **Dashboard** (`/dashboard`) | Hub tiles scoped to active tenant ✅ |
| **Settings** (`/settings/*`) | Profile + integrations for current tenant ✅ |
| **Admin — users** | Directory via tenant membership; cross-tenant 403 ✅ |
| **Admin — policies** | List/create/activate for `session.tenant_id` ✅ |
| **Admin — team/invites** | Invites for active tenant ✅ |
| **Admin — audit** | Audit log filtered by tenant ✅ |
| **Admin — tokens** | Platform token status global — owner-gated ✅ |
| **Satellite** | Permission gates + tenant-scoped session ✅ |

### Session model (Dioxus)

```rust
pub struct AuthSession {
    pub tenant_id: Option<String>,   // from login /api/rbac/me
    pub permissions: Vec<String>,  // effective slugs for active tenant
    // ... existing fields
}

impl AuthSession {
    pub fn has_permission(&self, slug: &str) -> bool {
        self.permissions.iter().any(|p| p == slug)
    }
    pub fn active_tenant(&self) -> &str {
        self.tenant_id.as_deref().unwrap_or(DEFAULT_TENANT_ID)
    }
}
```

**API client:** JWT carries session; no separate header required if `tenantId` is in token. If user belongs to multiple tenants (future), add `X-Tenant-Id` or tenant switcher → re-login / refresh with tenant claim.

### Default tenant bootstrap — Geosyntra platform super-tenant

On first API start, the **platform tenant** is **`geosyntra-default`** with display name **`Geosyntra`** and `is_platform_tenant = true` (Task **33.1**).

1. `seed_rbac_matrix(pool, tenant_id)` — roles + role_permissions
2. `seed_default_abac_policy(pool, tenant_id)` — activated `express-baseline-v1`
3. `ensure_system_owners` — owners bound to **Geosyntra** membership with full platform slugs
4. Platform-only slugs: `platform.tenant.manage`, `platform.policy.manage`, `platform.config.manage`, `platform.grant.manage`, `platform.membership.manage`

**Customer tenants:** repeat steps 1–2 on **approved** tenant creation (Task **33.7** quorum). Cross-tenant writes require Geosyntra platform role + audit.

**Governance:** New policy versions and new tenants require **≥3 admin approvals** before apply — see [dioxus-governance-plan.md](./dioxus-governance-plan.md).

### UI chrome

- App layout shows **active tenant** (name or slug) in sidebar/header for dashboard, settings, admin shells.
- On `403` with `tenant_mismatch` / isolation deny → redirect to dashboard with error (never silent empty state from wrong tenant).

**P2 (post cutover):** Tenant switcher for users with multiple `memberships` rows — out of scope for 23.5 except session field readiness.

**Performance (Task 23.6):** Cached session snapshot keyed by `(user_id, tenant_id)` holds permission slugs for Dioxus nav gates — see [redis-auth-cache-plan.md](./redis-auth-cache-plan.md). Invalidation on role/membership change is mandatory.

---

## ABAC default policy shape

One activated version **per tenant** (starting with `geosyntra-default`):

```
PolicyVersion: express-baseline-v1 (activated on first boot, tenant_id = T)
Rules: for each (role_slug, permission_slug) in MATRIX for tenant T:
  → Allow rule: resource + action from PermissionSlug::to_resource_action()
  → Condition: subject.tenant_id == T AND subject.roles contains role_slug
  → Resource rules include attribute tenant_id = T where applicable
```

`TenantIsolationPolicy` runs **before** stored ABAC and RBAC fallback ([engine order](./rbac-use-case-mapping.md)).

Fallback order at runtime (match [role_loader.rs](../packages/infrastructure/src/authz/role_loader.rs)):

1. Active ABAC policy (DB)
2. `rbac_role_permissions` join rows
3. Static `matrix::permissions_for_role()` (dev only)

---

## Exit criteria

- [x] Fresh DB + API start → active ABAC policy + RBAC matrix populated **per default tenant**
- [x] `trial_user` can reach `/satellite` but not `/admin/users` **within their tenant**
- [x] Cross-tenant user mutation returns 403 (integration test 23.5.12)
- [x] `manager` can approve users; cannot assign roles
- [x] `owner` has all platform slugs for their tenant
- [x] Dioxus dashboard/settings/admin use `has_permission`, not owner-only gates
- [x] Admin policy list only shows versions for `session.tenant_id`
- [x] Playwright role-matrix + tenant isolation specs pass (Task 25)

---

## References

- [redis-auth-cache-plan.md](./redis-auth-cache-plan.md)
- [role-permission-matrix.md](./role-permission-matrix.md)
- [permission-slug-matrix.md](./permission-slug-matrix.md)
- [rbac-use-case-mapping.md](./rbac-use-case-mapping.md) — tenant isolation + engine order
- [jwt-role-membership-bridge.md](./jwt-role-membership-bridge.md)
