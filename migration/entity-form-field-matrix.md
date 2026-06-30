# Admin entity form field matrix (Task 33.11 + Task 34 UI)

Source of truth for Dioxus admin create/edit **fields** vs domain aggregates and Postgres columns.

**Field rules (33.11):** Include domain non-optional and DB `NOT NULL` user-writable fields. Exclude server-assigned IDs, security/system fields, and audit timestamps from forms (read-only in lists/detail where useful).

**UI rules (34):** **No raw JSON in Dioxus admin UI.** Lists use **`AdminTable`**; create/edit/propose use **`AdminStepperModal`**; view-one uses **`AdminDetailModal`**. JSONB/API payloads are built from structured controls (toggles, key-value rows, tag inputs)—never `JsonTextArea`.

**Parent:** [dioxus-governance-plan.md](./dioxus-governance-plan.md) · **UI pattern:** [dioxus-admin-console-plan.md § Task 34](./dioxus-admin-console-plan.md#task-34--admin-table--stepper-modal-ui)

---

## UI surface map (Task 34)

| Surface | When |
|---------|------|
| **Table** | Default list page; row actions: View, Edit, lifecycle |
| **Stepper modal** | Create user, propose tenant, edit membership roles, grant create, config propose |
| **Detail modal** | Read-only row peek (user profile, grant, governance proposal summary) |
| **Full page** | Policy rule grid at `/admin/policies/{id}` only |

---

## Global exclusions (never in forms)

| Category | Fields |
|----------|--------|
| Server IDs | `user.id`, `grant.id`, `policy_version.id`, `rule.id`, `governance.proposal_id` |
| Auto-assigned | policy `version` integer (`MAX+1` per tenant) |
| Security | `password_hash`, OAuth subs, verification tokens, `scope`, `managed_by_id` |
| System counters | `failed_logins`, `locked_until`, `last_login` |
| Flags | `is_platform_tenant`, `is_active`, `email_verified`, row `version` |
| Timestamps | `created_at`, `updated_at`, `activated_at`, `revoked_at` (display only) |
| Session | `tenant_id` on policy create (from JWT) |
| Secrets | env binding values (status chip only) |

---

## Users (`admin_users` + domain `User`)

| Field | DB | Domain | Form | Mode |
|-------|-----|--------|------|------|
| email | NOT NULL | required | input | create, edit |
| username | nullable | required | input | create, edit |
| first_name | via profile | required | input | create, edit |
| last_name | via profile | required | input | create, edit |
| role | NOT NULL | display | RoleSelect | create, edit |
| bio | profile_extra | optional | textarea | edit |
| phone_numbers | profile_extra | optional | input | edit |
| website | profile_extra | optional | url input | edit |
| avatar_url | profile_image | optional | url input | edit |
| date_of_birth | profile_extra | optional | date input | edit |
| email_notifications | — | required | checkbox | edit |
| push_notifications | — | required | checkbox | edit |
| two_factor_auth | — | required | checkbox | edit |
| language | — | required | select | edit |
| password | password_hash | required | optional on create | create |
| status | NOT NULL | required | lifecycle buttons | — |
| id | PK | required | read-only table | — |

---

## Memberships (`memberships`)

| Field | DB | Domain | Form | Mode |
|-------|-----|--------|------|------|
| user_id | PK part | required | UserSelect | create |
| tenant_id | PK part | required | TenantSelect | create |
| roles | JSONB | HashSet | MultiRoleSelect | create, edit |
| created_at | NOT NULL | required | read-only | — |
| version | NOT NULL | required | read-only | — |

---

## Temporary grants (`temporary_grants`)

| Field | DB | Domain | Form | Mode |
|-------|-----|--------|------|------|
| tenant_id | NOT NULL | required | TenantSelect | create |
| user_id | NOT NULL | required | UserSelect | create |
| resource | NOT NULL | required | preset select | create |
| action | NOT NULL | required | preset select | create |
| description | NOT NULL default '' | required | textarea | create |
| expires_at | NOT NULL | required | duration preset | create |
| id | PK | — | read-only | — |
| revoked_at | nullable | — | read-only | — |

---

## Tenants (`tenants`)

| Field | DB | Domain | Form | Mode |
|-------|-----|--------|------|------|
| id | PK | required | slug input | create only |
| name | NOT NULL | required | input | create, update propose |
| description | — | required | textarea | create, update propose |
| config | JSONB | TenantConfig | **ConfigKeysEditor** (allowlisted) | update propose modal step 2 |
| is_platform_tenant | NOT NULL | — | read-only badge | — |
| created_at | NOT NULL | required | read-only | — |

---

## Policy versions + rules

### Version (`authorization_policy_versions`)

| Field | Form | Mode |
|-------|------|------|
| label | input | create, edit |
| version | read-only (server auto-next) | — |
| id, tenant_id, is_active, activated_at, created_at | read-only | — |

### Rule (`authorization_policies`)

| Field | DB | Form | Mode |
|-------|-----|------|------|
| resource_type | NOT NULL | input | edit grid |
| action | NOT NULL | input | edit grid |
| effect | NOT NULL | select | edit grid |
| priority | NOT NULL | number | edit grid |
| required_relations | JSONB | **TagInput** | edit modal / rule grid |
| required_subject_attributes | JSONB | **AttrRowEditor** | edit modal / rule grid |
| required_resource_attributes | JSONB | **AttrRowEditor** | edit modal / rule grid |
| id | PK | hidden (server) | — |

---

## Team invites (`role_invites`)

| Field | Form | Mode |
|-------|------|------|
| email | input | create |
| role_slug | RoleSelect | create |
| token, status, expires_at, invited_by | read-only table | — |

---

## Platform config

| Field | Form | Mode |
|-------|------|------|
| allowlisted tenant config keys | **ConfigKeysEditor** | governance propose modal |
| platform non-secret toggles | **ConfigKeysEditor** | propose modal step 1 |
| env binding names | status chips | read-only |

Allowlist enforced server-side; secrets never in forms.

---

## Implementation map

| Subtask | Scope |
|---------|-------|
| 33.11.0 | This doc + plan cross-links |
| 33.11.1 | `packages/web/src/components/admin/forms/` |
| 33.11.2 | User API + PATCH extensions |
| 33.11.3 | Policy auto-version + ABAC rule JSON |
| 33.11.4 | Tenant description/config + platform config proposals |
| 33.11.5 | Membership `roleSlugs[]` |
| 33.11.6 | All `/admin/*` pages (inline forms — superseded by 34) |
| 33.11.7 | Playwright + integration tests |
| **34.0** | Plan + matrix UI rules; ban JSON forms |
| **34.1** | `components/admin/modal/`, `table/`, `editors/` |
| **34.2** | Users, memberships, grants, team → table + modals |
| **34.3** | Tenants, platform → ConfigKeysEditor + propose stepper |
| **34.4** | Policies, governance → view modals + AttrRowEditor |
| **34.5** | Remove `JsonTextArea`; Playwright modal specs |
