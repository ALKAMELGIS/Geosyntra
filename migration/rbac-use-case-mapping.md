# Use-case → Express RBAC permission mapping

Maps application `UseCaseDescriptor` (`RESOURCE` + `ACTION`) to domain `Resource` + `Action` for
`RbacPermissionPolicy` (Task 5c). Implementation:
[`packages/application/src/authorization/policys/rbac_mapping.rs`](../packages/application/src/authorization/policys/rbac_mapping.rs).

Express slug reference: [permission-slug-matrix.md](./permission-slug-matrix.md).  
Architecture reference: [clean-architecture-guidelines.md](./clean-architecture-guidelines.md).  
Latest audit: [pre-task-audit-16.md](./pre-task-audit-16.md).

## Current mapping

| Use-case resource | Use-case action | Domain resource | Domain action | Express slug (nearest) |
|-------------------|-----------------|-----------------|---------------|------------------------|
| `user` | `read`, `list` | `admin_users` | `read` | `admin.users.read` |
| `user` | `create`, `update`, `delete` | `admin_users` | `manage` | `admin.users.manage` |
| `user` | `approve` | `admin_users` | `approve` | `admin.users.approve` |
| `user` | `suspend`, `reactivate` | `admin_users` | `suspend` | `admin.users.suspend` |
| `role` | `read`, `list` | `admin_panel` | `access` | `admin.panel` |
| `role` | `create`, `update`, `delete` | `admin_roles` | `assign` | `admin.roles.assign` |
| `policy` | `read`, `list` | `admin_panel` | `access` | `admin.panel` |
| `policy` | `create`, `update`, `delete` | `admin_roles` | `assign` | `admin.roles.assign` |
| `membership` | `read`, `list` | `admin_panel` | `access` | `admin.panel` |
| `membership` | `create`, `update`, `set_role`, `delete` | `admin_roles` | `assign` | `admin.roles.assign` |
| `audit` | `read`, `list` | `admin_audit` | `read` | `admin.audit.read` |
| `invite` | `read`, `list`, `preview` | `admin_invites` | `create` | `admin.invites.create` |
| `invite` | `create`, `accept` | `admin_invites` | `create` | `admin.invites.create` |
| `auth` | `read`, `login`, `register`, `refresh` | `app` | `access` | `app.access` |
| `billing` | `read`, `list` | `app` | `access` | `app.access` |

**Coverage:** 38 use cases implement `UseCaseDescriptor`; all 34 distinct `(RESOURCE, ACTION)` pairs map successfully.

Field visibility is **not** tiered by use-case name (`*Privilege` / `*General` removed). Read use cases call
`readable_user_fields` / `readable_role_fields` / `readable_membership_fields` from subject permissions; projectors apply `AccessControl`.

### Self-read (M3)

Logic in [`field_sets.rs`](../packages/application/src/usecases/field_sets.rs). `with_target_user_id` wired on:

| Use case | Wiring |
|----------|--------|
| `GetUserByIdUseCase` | Always (requested id) |
| `GetAuthMeUseCase` | Always (self) — `PublicUserProjector` ✅ |
| `GetUserByEmailUseCase` | Conditional after id pre-lookup |
| `GetUserByUsernameUseCase` | Conditional after id pre-lookup |
| `UpdateUserUseCase` | Always (target id from command) ✅ |
| `ListUserUseCase` | Per-row via `view.id` ✅ |
| `SuspendUserUseCase`, `ApproveUserUseCase`, `ReactivateUserUseCase`, `DeleteUserUseCase` | Target id ✅ (audit #8) |

## Lifecycle routes (Task 7 ✅)

| Express route | Use case | Status |
|---------------|----------|--------|
| `POST …/users/:id/approve` | `ApproveUserUseCase` | ✅ Task 7 |
| `POST …/users/:id/suspend` | `SuspendUserUseCase` | ✅ Task 7 |
| `POST …/users/:id/reactivate` | `ReactivateUserUseCase` | ✅ Task 7 |
| `PATCH …/users/:id` (role change) | `SetUserRoleUseCase` | ✅ Task 13 — Axum handler |

## RBAC parity (Task 8 ✅)

| Express route | Permission slug | Use case |
|---------------|-----------------|----------|
| `GET …/audit` | `admin.audit.read` | `ListAuditLogUseCase` | ✅ Task 14 Axum |
| `GET/POST …/invites` | `admin.invites.create` | `ListInvitesUseCase`, `CreateInviteUseCase` | ✅ Task 14 Axum |
| `GET …/invites/preview` | public (token query) | `PreviewInviteUseCase` | ✅ Task 14 Axum |
| `POST …/invites/accept` | public | `AcceptInviteUseCase` | ✅ Task 14 Axum |
| `GET …/permissions/matrix` | `admin.panel` | `ExportPermissionsMatrixUseCase` | ✅ Task 14 Axum |
| `POST …/auth/login` | public | `LoginUseCase` |
| `POST …/auth/register` | public | `RegisterUseCase` |
| `POST …/auth/refresh` | refresh token | `RefreshTokenUseCase` |
| `GET …/auth/me` | `app.access` | `GetAuthMeUseCase` |
| `GET …/billing/plans` | public | `ListBillingPlansUseCase` | ✅ Task 15 Axum |
| `GET …/billing/me` | `app.access` | `GetBillingMeUseCase` | ✅ Task 15 Axum |
| `POST …/billing/webhook` | Stripe signature | stub | ⚠️ Task 15 stub |
| `POST …/billing/start-trial` | `app.access` | `StartBillingTrialUseCase` | ✅ Task 16 Axum |
| `POST …/billing/activate` | `app.access` | `ActivateBillingPlanUseCase` | ✅ Task 16 Axum |

**Rule:** Do not overload `UpdateUserUseCase` for role assignment — use `SetUserRoleUseCase`.

## Versioned stored policies (Task 6 port + Task 9 impl ✅)

- Tables: `authorization_policy_versions`, `authorization_policies`.
- Port: [`PolicyRepository`](../packages/application/src/ports/policy.rs).
- Impl: [`PostgresPolicyRepository`](../packages/infrastructure/src/postgres/policy_repository.rs) — atomic activate (M1 ✅).
- Engine: `register_stored_policies` / `with_stored_policies`; evaluation order fixed Task 11 (C1 ✅).

**M4 (✅ Task 15):** `ReloadableAuthorizationService` loads tenant policies on auth; `invalidate_tenant` on policy activation.

## Tenant isolation (Task 14 ✅ H2-full)

`TenantIsolationPolicy` denies when `resource_attributes["tenant_id"] != subject.tenant_id()`. User lifecycle handlers call `resolve_resource_tenant` via `MembershipReadRepository::find_tenant_for_user` before use-case execute (Task 14).

## RBAC vs ABAC vs billing (three checks)

| Check | Mechanism | Status |
|-------|-----------|--------|
| **RBAC** | `RbacPermissionPolicy` + `SubjectContext` | ✅ Runtime |
| **ABAC** | `ApplicationStoredPolicy` | ✅ Per-tenant reload on auth (Task 15) |
| **Billing** | `TenantFeatureConfig::evaluate` + subscription repo | ✅ Domain + read infra (Task 11) |

See [billing-rbac-bridge.md](./billing-rbac-bridge.md) and [clean-architecture-guidelines.md](./clean-architecture-guidelines.md).
