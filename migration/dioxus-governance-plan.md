# Platform governance plan (Task 33)

**Goal:** Complete **admin CRUD** for platform governance entities, designate the **Geosyntra** tenant as the **platform super-tenant**, and require **quorum approval (≥3 admins)** before new **policy versions** or **tenants** take effect — with every step recorded in **`admin_audit`**.

**Branch:** `feature/axum-migration` — all work stays on the feature branch (no merge milestone).

**Parent plans:** [dioxus-admin-console-plan.md](./dioxus-admin-console-plan.md) · [dioxus-access-control-plan.md](./dioxus-access-control-plan.md) · [task-execution-workflow.md](./task-execution-workflow.md)

---

## Current state (Task 33 ✅)

Task 22 shipped list pages; Task **33** added full CRUD, governance quorum, and Task **34** refactored admin UI to table + stepper modals.

| Entity | Axum API | Dioxus UI |
|--------|----------|-----------|
| **Policy version** | Task 19 + governance queue on create/activate ✅ | List + governance proposal on create ✅ |
| **User** | `/api/rbac/users/*` CRUD + lifecycle ✅ | Table + stepper create/edit + detail modal ✅ |
| **Membership** | `/api/platform/memberships/*` ✅ | Table + stepper modals ✅ |
| **Temporary grant** | `/api/platform/grants/*` ✅ | Table + stepper modals ✅ |
| **Tenant** | `/api/platform/tenants/*` + propose-update ✅ | Table + stepper modals ✅ |
| **App configuration** | `/api/platform/config` + propose-update ✅ | Structured config editor + propose modal ✅ |
| **Team invite** | `/api/rbac/invites/*` ✅ | Table + stepper invite modal ✅ |
| **Governance inbox** | `/api/governance/proposals/*` ✅ | Table + approve/reject ✅ |

**Runtime note:** Admin API `400` in dev usually means **missing JWT** (visit `/login` first). Mapbox `403` is token URL restriction — see Task 27.0 Mapbox dev proxy.

---

## Geosyntra platform super-tenant (33.1)

### Rules

1. Default platform tenant slug: **`geosyntra-default`** (stable FK), display name **`Geosyntra`**, `is_platform_tenant = true`.
2. Users with **`geosyntra-default:owner`** (or **`super_admin`**) in Geosyntra get **cross-tenant read** for governance; **writes on policy/tenant create go through approval queue only**.
3. Customer tenants stay isolated — no cross-tenant mutation without platform role + audit.
4. Bootstrap on `prepare_database()` / `bootstrap()`:
   - Upsert tenant: id `geosyntra-default`, name `Geosyntra`, `is_platform_tenant: true`
   - Seed RBAC + ABAC for platform tenant
   - Bind system owners to Geosyntra membership with `owner` role

### Schema (migration 33.1)

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform_tenant BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE tenants SET name = 'Geosyntra', is_platform_tenant = TRUE WHERE id = 'geosyntra-default';
```

Optional P2: `tenants.parent_tenant_id`, `tenants.status` (`active | suspended | archived`).

### Permission slugs (matrix seed)

| Slug | Purpose |
|------|---------|
| `platform.tenant.manage` | Propose/manage customer tenants (quorum on create) |
| `platform.policy.manage` | Propose policy versions (quorum before activate) |
| `platform.config.manage` | Edit allowlisted platform + tenant config keys |
| `platform.grant.manage` | CRUD temporary grants |
| `platform.membership.manage` | CRUD memberships across tenants |

`owner` / `super_admin` receive all slugs including `platform.*`. Tenant-scoped admins keep existing slugs scoped to `session.tenant_id`.

---

## Multi-admin approval workflow (33.7–33.8)

### Design

High-impact changes enter **`governance_proposals`**; **≥3 distinct admin approvers** must approve before apply.

| Proposal type | Applies use case | Quorum scope | Proposer counts? |
|---------------|------------------|--------------|------------------|
| `policy.create` | `CreatePolicyVersionUseCase` | 3 admins **in target tenant** with `admin.roles.assign` | **No** |
| `policy.activate` | `ActivatePolicyVersionUseCase` | Same tenant scope | **No** |
| `tenant.create` | `TenantRepository::create` + seed | 3 **Geosyntra** admins with `platform.tenant.manage` | **No** |
| `tenant.update` | `TenantRepository::update` | Platform scope for customer tenants; tenant scope for own config | **No** |
| `config.update` (platform keys) | Config patch | 3 Geosyntra admins with `platform.config.manage` | **No** |

Lower-risk ops (user suspend, invite, grant revoke) stay **immediate** with audit.

### Scope-by-tenant (required)

- **Platform proposals** (new tenant, platform config): approvers must hold relevant `platform.*.manage` **in Geosyntra tenant**.
- **Tenant-scoped policy proposals**: approvers must hold `admin.roles.assign` **in that tenant**.
- Prevents customer admins from approving platform-wide changes.

### Tables

```sql
CREATE TABLE governance_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  proposal_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_approvals INT NOT NULL DEFAULT 3,
  proposer_user_id TEXT NOT NULL,
  rejection_reason_code TEXT,
  rejection_reason_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reviewable_after TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ,
  UNIQUE (proposal_type, tenant_id, payload_hash, status)
    WHERE status = 'pending'
);

CREATE TABLE governance_approvals (
  proposal_id TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, approver_user_id)
);
```

Status values: `pending | approved | applied | rejected | expired`.

### Built-in safeguards (required, not optional)

1. **Separation of duties** — proposer never counts toward quorum.
2. **Proposal TTL** — default 7 days; background job marks `expired` + audit event.
3. **Proposal deduplication** — `payload_hash` + unique partial index on pending `(type, tenant_id, hash)`.
4. **Minimum review window** — default 15 minutes after create before first approval (`reviewable_after`).
5. **Structured rejection** — enum `incorrect_payload | security_concern | duplicate | other` + free text in audit.
6. **Immutable audit** — append-only `admin_audit`; no UPDATE/DELETE on audit rows (app + optional DB trigger).
7. **Payload preview** — proposal detail shows ABAC diff before approval (extends policy diff view).
8. **Admin nav badge** — pending count on `/admin/governance` in `AdminShell`.
9. **Grant safety** — grants cannot exceed grantor permissions; max TTL 72h; max N active grants per user; auto-revoke job.
10. **Config split** — tenant `config` JSON (allowlisted keys in UI); secrets env-only with configured/not-configured indicator.
11. **Break-glass (P2)** — single Geosyntra owner emergency apply + mandatory audit + notification.
12. **Notification hook (P2)** — webhook/email on new proposal.
13. **Mobile/desktop** — governance inbox read-only on mobile; approve/reject on web/desktop only.

### Audit events

| `action` | `details` |
|----------|-----------|
| `governance.proposal.created` | `{ proposal_id, type, tenant_id, payload_hash }` |
| `governance.approval.recorded` | `{ proposal_id, approver_id, count, required }` |
| `governance.proposal.applied` | `{ proposal_id, result_id }` |
| `governance.proposal.rejected` | `{ proposal_id, reason_code, reason_text }` |
| `governance.proposal.expired` | `{ proposal_id }` |

### HTTP surface (33.7)

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/governance/proposals` | List pending + recent |
| `GET` | `/api/governance/proposals/pending-count` | Badge count |
| `POST` | `/api/governance/proposals` | Create proposal |
| `POST` | `/api/governance/proposals/{id}/approve` | Record approval; auto-apply at quorum |
| `POST` | `/api/governance/proposals/{id}/reject` | Reject with reason code + text |
| `GET` | `/api/governance/proposals/{id}` | Detail + approvals + diff preview |

Direct `POST /api/rbac/policies` (create/activate) and tenant create **return 409 or redirect** to governance queue.

### Dioxus UI

| Page | Path |
|------|------|
| Approval inbox | `/admin/governance` |
| Proposal detail | `/admin/governance/{id}` |
| Tenants | `/admin/tenants` |
| Memberships | `/admin/memberships` |
| Temporary grants | `/admin/grants` |
| Platform config | `/admin/platform` |
| Users (full CRUD) | `/admin/users` |

---

## Task 33 iterations

| ID | Deliverable | Layer |
|----|-------------|-------|
| **33.1** | Geosyntra platform tenant + `platform.*` slugs | Infra + migration |
| **33.7** | `governance_proposals` schema + approval use cases + HTTP | App + API |
| **33.8** | Audit integration; disable direct policy/tenant create | Infra + API |
| **33.2** | Tenant HTTP + `/admin/tenants` | API + Web |
| **33.3** | Membership HTTP + `/admin/memberships` | API + Web |
| **33.4** | `temporary_grants` + HTTP + `/admin/grants` | Infra + API + Web |
| **33.5** | App config admin forms | API + Web |
| **33.6** | User CRUD forms | Web |
| **33.9** | Integration tests: quorum, proposer exclusion, dedup, expiry, tenant isolation | API |
| **33.10** | Playwright: 3-admin flow, Geosyntra tenant create | QA |
| **33.11** | Entity form field parity — domain/DB-aligned Dioxus forms, exclude system IDs | API + Web + QA |
| **34** | Admin table + stepper modal UI — no JSON forms; structured editors | Web + QA |

**Commit order:** 33.1 → 33.7–33.8 → 33.2 → 33.3 → 33.4 → 33.5 → 33.6 → 33.9–33.10 → **33.11** → **34**.

**Detail (Task 34):** [dioxus-admin-console-plan.md § Task 34](./dioxus-admin-console-plan.md#task-34--admin-table--stepper-modal-ui)

---

## Exit criteria

- [x] Geosyntra tenant bootstrapped (`is_platform_tenant`, name **Geosyntra**)
- [x] `platform.*` slugs seeded; owner/super_admin have them
- [x] Direct policy create/activate and tenant create routed through governance queue
- [x] ≥3 admin approvals with scope-by-tenant rules
- [x] Dedup, review window, structured rejection, immutable audit
- [x] Dioxus CRUD forms: users, memberships, tenants, grants, config, governance inbox
- [x] Task 33.11: forms match [entity-form-field-matrix.md](./entity-form-field-matrix.md); no manual server IDs
- [x] Integration + Playwright green
- [x] Task 34: table + stepper modal UI; no JSON forms in Dioxus (see admin console plan)
- [x] Route map updated in [dioxus-admin-console-plan.md](./dioxus-admin-console-plan.md)

---

## References

- [`PostgresTenantRepository`](../packages/infrastructure/src/postgres/tenant_repository.rs)
- [`TemporaryGrant`](../packages/domain/src/temporary_grant/mod.rs)
- [`admin_audit` schema](../packages/infrastructure/migrations/20250614000001_platform_schema.sql)
