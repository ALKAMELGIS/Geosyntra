mod support;

use domain::membership::Membership;
use domain::permissions::PermissionId;
use domain::{DomainError, RoleId, TenantId, UserId};
use std::collections::HashSet;

#[test]
fn membership_add_and_remove_role() {
    let membership = Membership::new(
        UserId::new("u1"),
        TenantId::new("t1"),
        HashSet::from([RoleId::new("viewer")]),
        support::ts(1),
        1,
    );
    let with_admin = membership.with_role_added(RoleId::new("admin"));
    assert!(with_admin.has_role(&RoleId::new("admin")));
    assert_eq!(with_admin.roles().len(), 2);

    let back = with_admin.with_role_removed(&RoleId::new("admin")).unwrap();
    assert_eq!(back.roles().len(), 1);
}

#[test]
fn membership_require_non_empty_alias() {
    let roles: HashSet<RoleId> = HashSet::new();
    assert!(Membership::require_non_empty(&roles).is_err());
    assert!(Membership::ensure_roles_not_empty(&roles).is_err());
}

#[test]
fn membership_cannot_remove_last_role() {
    let membership = Membership::new(
        UserId::new("u1"),
        TenantId::new("t1"),
        HashSet::from([RoleId::new("viewer")]),
        support::ts(1),
        1,
    );
    assert!(matches!(
        membership.with_role_removed(&RoleId::new("viewer")),
        Err(DomainError::ValidationError(_))
    ));
}

#[test]
fn role_add_and_remove_permission() {
    let read = support::sample_permission("p1", "users", "read");
    let write = support::sample_permission("p2", "users", "write");
    let role = support::sample_role("admin", HashSet::from([read.clone()]));

    let with_write = role.with_permission_added(write.clone());
    assert_eq!(with_write.permissions().len(), 2);

    let back = with_write
        .with_permission_removed(&PermissionId::new("p2"))
        .unwrap();
    assert_eq!(back.permissions().len(), 1);
    assert!(back.has_permission(
        &domain::Resource::new("users").unwrap(),
        &domain::Action::new("read").unwrap()
    ));
}
