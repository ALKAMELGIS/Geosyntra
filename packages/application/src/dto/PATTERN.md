# Application DTO pattern (`*View` / `*Command`)

Partial-load types belong in **application only** — never in `packages/domain`.

## Rules

1. **Domain aggregates** are always fully constructed (immutable, no `Option` identity fields).
2. **Read paths** return `*View` DTOs with `Option<T>` per field — SQL may omit columns; projector fills allowed fields.
3. **Write paths** accept `*Command` DTOs → map to domain transition methods → persist via `get_for_update` ports.
4. **No duplicate output types** — one `UserView` per entity; subject permissions and projectors select field visibility via `AccessControl`, not separate use-case tiers or output types.

## Layout

```
packages/application/src/dto/
├── PATTERN.md              ← this file
├── mod.rs
├── user/
│   ├── mod.rs
│   ├── view.rs             ← UserView { id: Option<UserId>, email: Option<Email>, ... }
│   └── command.rs          ← CreateUserCommand, UpdateUserCommand, ...
├── role/
│   ├── view.rs             ← RoleView
│   └── command.rs
├── tenant/
│   └── view/
│       └── membership.rs   ← MembershipView (done — Task 1)
└── ...
```

## `*View` conventions

```rust
#[derive(Debug, Clone, Default)]
pub struct UserView {
    pub id: Option<UserId>,
    pub email: Option<Email>,
    // omitted fields = None (not loaded or denied by projection)
}
```

- Use domain value objects (`Email`, `UserId`) inside views — not raw `String`.
- Projectors zero denied fields to `None` after `apply_access`.
- Handlers map `UserView` → JSON in the interface layer.

## `*Command` conventions

- Commands carry only fields the use case needs for writes.
- Validation of business rules happens on domain aggregates, not in commands.
- Commands do not implement `Event`.

## SubjectContext

Request-scoped authorization subject lives in [`subject_context.rs`](../subject_context.rs) (not domain). Built from JWT + membership in interface layer (Task 12); query API (`has_role`, `has_permission`, `active_grants`) is Task 5a ✅.

## Task ownership

| Item | Task |
|------|------|
| `MembershipView` moved out of domain | Task 1 ✅ |
| This pattern doc | Pre-Task 4 gate ✅ |
| `UserView`, `RoleView`, tenant views | Task 4 ✅ |
| Projectors + `AccessControl` | Task 6 ✅ |
| Self-read field wiring (`with_target_user_id`) | Task 8 ✅ partial → Task 11 ✅ (4 paths) → Task 12 (update/list) |
| `PublicUserView` projection on auth/me | ✅ Task 12 (`PublicUserProjector`) |
| `UserIdAllocator` at composition root | Task 15 |

See [clean-architecture-guidelines.md](../../../migration/clean-architecture-guidelines.md) for two-phase auth + projection rules.

## Anti-patterns

- ❌ `UserView` in domain crate
- ❌ Returning `User` aggregate directly as JSON
- ❌ Separate `GetUserBasicOutput` / `GetUserAdminOutput` types
