# Dioxus admin console plan (Tasks 19, 22)

Maps **Axum admin API** capabilities to **Dioxus admin pages**. Policy version management is **Axum-only** today (use cases + Postgres exist; HTTP + UI do not).

**Parent plans:** [dioxus-axum-plan.md](./dioxus-axum-plan.md) · [axum-migration-plan.md](./axum-migration-plan.md)

---

## React admin today (reference only)

| React page | Route prefix | Axum API today |
|------------|--------------|----------------|
| `AdminUsersPage` | `/settings/admin/users` | `/api/rbac/users/*` ✅ |
| `AdminDashboardPage` | `/settings/admin/overview` | partial `/api/rbac/me`, billing read |
| `AdminTeamPage` | `/settings/admin/team` | `/api/rbac/invites/*` ✅ |
| `AdminRolesPage` | `/settings/admin/roles` | `/api/rbac/permissions/matrix` ✅ |
| `AdminAuditPage` | `/settings/admin/audit` | `/api/rbac/audit` ✅ |
| `AdminSystemTokensPage` | `/settings/admin/tokens` | `/api/system/tokens/*` ✅ |
| Subscriptions | (placeholder) | billing routes ✅ — **no UI** |

**Gap:** No React page for **authorization policy versions** (`authorization_policy_versions` / `authorization_policies` tables). Application layer already has:

- `ListPolicyVersionsUseCase`, `GetPolicyVersionUseCase`
- `CreatePolicyVersionUseCase`, `UpdatePolicyVersionUseCase`, `DeletePolicyVersionUseCase`
- `ActivatePolicyVersionUseCase` + tenant policy reload (Task 15)

---

## Task 19 — Admin HTTP routes to add

| Method | Path | Use case | RBAC |
|--------|------|----------|------|
| `GET` | `/api/rbac/policies` | `ListPolicyVersionsUseCase` | `policy.list` |
| `POST` | `/api/rbac/policies` | `CreatePolicyVersionUseCase` | `policy.create` |
| `GET` | `/api/rbac/policies/{id}` | `GetPolicyVersionUseCase` | `policy.read` |
| `PATCH` | `/api/rbac/policies/{id}` | `UpdatePolicyVersionUseCase` | `policy.update` |
| `DELETE` | `/api/rbac/policies/{id}` | `DeletePolicyVersionUseCase` | `policy.delete` |
| `POST` | `/api/rbac/policies/{id}/activate` | `ActivatePolicyVersionUseCase` | `policy.update` |

Optional later:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/rbac/policies/active` | Summary of active version + rule count |
| `POST` | `/api/rbac/policies/{id}/clone` | Duplicate version as draft |

Add each route to `route_catalog.rs` and integration tests when implemented.

---

## Task 22 — Dioxus admin pages (SCSS + Rust)

**Layout:** Extend Task 20 SCSS (`_admin.scss`, `_policy-editor.scss`). **Logic:** Rust components only.

| Page | Path (proposed) | Priority | Notes |
|------|-----------------|----------|-------|
| **Policy versions** | `/admin/policies` | P0 | List, create, edit ABAC rules, activate |
| **Policy detail** | `/admin/policies/{id}` | P0 | Rule table: resource, action, effect, priority |
| **User management** | `/admin/users` | P0 | Migrate from `AdminUsersPage` |
| **Team & invites** | `/admin/team` | P1 | ✅ Invite form + pending approval |
| **Roles & matrix** | `/admin/roles` | P1 | ✅ Matrix viewer |
| **Audit log** | `/admin/audit` | P1 | ✅ Audit table |
| **System tokens** | `/admin/tokens` | P1 | ✅ Owner-only status |
| **Billing admin** | `/admin/billing` | P2 | Plans + tenant subscription (new) |
| **Platform config** | `/admin/platform` | P2 | Read-only config/gateway status |
| **Overview** | `/admin/overview` | P2 | Dashboard widgets |

### Policy version UI (Axum-native)

Rust components to implement:

1. **`PolicyVersionList`** — table: version, label, active badge, created/activated timestamps
2. **`PolicyRuleEditor`** — grid of rules (`resource_type`, `action`, `effect`, `priority`); validate in Rust before PATCH
3. **`ActivatePolicyDialog`** — confirm single active version per tenant; show reload notice
4. **`PolicyDiffView`** — compare draft vs active (read-only)

SCSS: reuse admin lifecycle badges and glass panel tokens from React `admin.css` / `admin-access-gate.css`.

---

## Styling migration (SCSS)

| React today | Dioxus target |
|-------------|---------------|
| `admin.css`, `admin-access-gate.css`, `admin-system-tokens.css` | `assets/scss/admin/_layout.scss`, `_badges.scss`, `_tokens.scss` |
| `index.css` design tokens | `assets/scss/_tokens.scss` (CSS variables) |
| Component inline styles | Avoid — use SCSS classes + Rust `class` bindings |

Introduce SCSS in **Task 20** before page migration so Task 22 admin pages are SCSS-native, not CSS ports.

---

## API client (Rust)

Single crate module `geosyntra_web::api::admin`:

- Typed structs mirroring application DTOs (`PolicyVersionView`, `PolicyRuleCommand`, …)
- `ApiClient` with JWT from `auth_session`
- Error mapping to user-facing messages (Axum `{ error, code }` shape)

No generated OpenAPI client — hand-maintained types aligned with use-case DTOs until cutover stabilizes.

---

## Exit criteria (Task 22)

- [x] Policy version CRUD + activate works in Dioxus against Task 19 routes
- [x] Owner can complete user approve/suspend/reactivate flow without React
- [x] System tokens page owner-gated (status view)
- [x] Team invites, roles matrix, and audit log pages wired to Axum
- [x] SCSS builds in CI; no unstyled admin placeholders
- [x] Admin route map documented and matches `route_catalog` subset used by UI

**Remaining (P2):** billing admin, policy diff view.

**Next (Task 34):** Replace inline forms and JSON textareas with **table + stepper modal** pattern — see [Admin UI shell (Task 34)](#task-34--admin-table--stepper-modal-ui).

---

## Task 34 — Admin table + stepper modal UI

**Goal:** Every `/admin/*` entity page uses a **list table** as the primary surface. **No raw JSON forms** in Dioxus (`JsonTextArea`, free-text config blobs, or ABAC JSON paste fields). Create, edit, and governance propose flows open a **multi-step modal**; viewing a single row opens a **read-only detail modal** (or dedicated detail route where a full rule grid is needed, e.g. policy version).

**Parent:** Task 33.11 field parity is done at the API/matrix level; Task 34 is **presentation-only** (same payloads, structured UI).

### UI rules (mandatory)

| Pattern | Use for | Do not use |
|---------|---------|------------|
| **`AdminTable` + row actions** | All entity lists | Inline `gs-card gs-admin-form` on list pages |
| **`AdminStepperModal`** | Create, edit, propose-update (2–4 steps) | Single-page JSON blob or always-visible create form |
| **`AdminDetailModal`** | View one row (read-only meta + field summary) | Navigating away for simple peek; duplicate inline edit panels |
| **Structured field components** | Allowlisted config keys, ABAC attrs, relations | `JsonTextArea`, `serde_json` paste areas |
| **Full-page detail** | Policy rule grid, governance diff preview | Only when modal cannot fit (policy editor stays at `/admin/policies/{id}` until 34.5 optional merge) |

### Stepper modal flows (by entity)

| Entity | List table columns | Create steps | Edit / propose steps | View modal |
|--------|-------------------|--------------|----------------------|------------|
| **Users** | id, name, email, role, status | 1 Identity → 2 Role → 3 Confirm | 1 Profile → 2 Preferences → 3 Confirm | Profile summary + lifecycle status |
| **Tenants** | id, name, platform badge, created | 1 Slug & name → 2 Description → 3 Config (allowlisted) → 4 Confirm | 1 Name & description → 2 Config → 3 Confirm | Metadata + config chips |
| **Memberships** | user, tenant, roles, created | 1 User → 2 Tenant → 3 Roles → 4 Confirm | 1 Roles → 2 Confirm | Role set + ids (read-only) |
| **Grants** | user, resource, action, expires | 1 Subject → 2 Permission → 3 Duration & description → 4 Confirm | — (revoke only) | Grant summary |
| **Platform config** | key, value, updated (derived) | — | 1 Toggles & allowlisted fields → 2 Confirm propose | Current settings read-only |
| **Policies** | version, label, active, count | 1 Label → 2 Confirm propose | — | Link to detail page / summary modal |
| **Governance** | type, tenant, status, approvals | — | Approve/reject in detail modal | Payload preview (structured diff, not raw JSON) |
| **Team invites** | email, role, status | 1 Email → 2 Role → 3 Confirm | — | Invite status |

### Structured editors (replace JSON UI)

| Data | Dioxus control | API shape unchanged |
|------|----------------|---------------------|
| Tenant / platform allowlisted config | Per-key `Toggle`, `NumberField`, `TextField` from allowlist | JSON object PATCH |
| `required_relations` | Tag / comma chip input | `string[]` |
| `required_subject_attributes` | Key-value row editor (`AttrRowEditor`) | JSON object |
| `required_resource_attributes` | Key-value row editor | JSON object |

Remove **`JsonTextArea`** from admin pages when Task 34 is complete; keep server-side JSON validation unchanged.

### Components (`packages/web/src/components/admin/`)

| Component | Purpose |
|-----------|---------|
| `modal/mod.rs` | `AdminModal` shell (focus trap, ESC, overlay) |
| `modal/stepper.rs` | `AdminStepperModal` — steps, back/next, submit |
| `modal/detail.rs` | `AdminDetailModal` — read-only field grid |
| `table/mod.rs` | `AdminTable` — sortable header, empty state, row actions |
| `editors/attr_rows.rs` | ABAC key-value rows |
| `editors/config_keys.rs` | Allowlisted config toggles/inputs |

### Subtasks

| ID | Deliverable |
|----|-------------|
| **34.0** | Plan + matrix UI column; ban JSON forms in admin |
| **34.1** | Shared modal + table + stepper primitives + SCSS |
| **34.2** | Users, memberships, grants, team — table + modals |
| **34.3** | Tenants, platform config — structured config editors + propose modals |
| **34.4** | Policy list + governance inbox — view modals; ABAC `AttrRowEditor` on detail |
| **34.5** | Remove all `JsonTextArea` from admin; Playwright modal specs |

### Exit criteria

- [x] No `JsonTextArea` (or raw JSON textarea) on any `/admin/*` page
- [x] Every governance CRUD list is table-first with create/edit in stepper modal
- [x] Row click or "View" opens detail modal with read-only fields
- [x] Playwright covers at least one create + one edit modal flow per entity group
- [x] [entity-form-field-matrix.md](./entity-form-field-matrix.md) UI column matches modal steps

---

## Task 33 — Full governance CRUD + quorum (extends Task 22)

Task 22 marked ✅ for **MVP admin** (lists + policy editor + lifecycle buttons). **Task 33** adds full CRUD forms and multi-admin approval.

**Detail:** [dioxus-governance-plan.md](./dioxus-governance-plan.md) · **Field matrix:** [entity-form-field-matrix.md](./entity-form-field-matrix.md) (Task 33.11)

| Page | Path | Task 33 deliverable |
|------|------|---------------------|
| **Tenants** | `/admin/tenants` | List, propose create, edit name/config (quorum) |
| **Memberships** | `/admin/memberships` | Assign/remove roles per user↔tenant |
| **Temporary grants** | `/admin/grants` | Create, list, revoke time-boxed permissions |
| **Platform config** | `/admin/platform` | Edit allowlisted tenant + platform config keys |
| **Users** | `/admin/users` | Create account, edit drawer, role/plan, delete |
| **Governance inbox** | `/admin/governance` | Approve/reject proposals (≥3 admins) |
| **Policy versions** | `/admin/policies` | Create/activate via **proposal queue** only |

### Admin nav (after Task 33)

Add to `AdminShell`: Tenants, Memberships, Grants, Platform, Governance (inbox).

---

## References

- [`PolicyRepository`](../packages/application/src/ports/policy.rs)
- [`rbac-use-case-mapping.md`](./rbac-use-case-mapping.md) — policy resource mapping
- [`frontend/src/pages/admin/`](../frontend/src/pages/admin/) — React reference UX
