mod support;

use domain::permissions::Permission;
use domain::temporary_grant::TemporaryGrant;
use domain::{Action, Description, PermissionId, Resource, RoleId, UserId};
use std::collections::HashSet;

#[test]
fn permission_matches_exact_resource_action_pair() {
    let perm = support::sample_permission("p1", "users", "read");
    let users_read = (Resource::new("users").unwrap(), Action::new("read").unwrap());
    let users_write = (Resource::new("users").unwrap(), Action::new("write").unwrap());

    assert!(perm.matches(&users_read.0, &users_read.1));
    assert!(!perm.matches(&users_write.0, &users_write.1));
}

#[test]
fn permission_into_parts_and_event_type() {
    let perm = support::sample_permission("p1", "aoi", "write");
    let parts = perm.into_parts();
    assert_eq!(parts.id.as_str(), "p1");
    assert_eq!(parts.resource.resource(), "aoi");
    assert_eq!(parts.action.action(), "write");
    assert_eq!(domain::Event::get_type(&Permission::new(
        PermissionId::new("p2"),
        Resource::new("aoi").unwrap(),
        Action::new("write").unwrap(),
        Description::new("perm").unwrap(),
        support::ts(1),
        1,
    )), "PERMISSION");
}

#[test]
fn role_has_permission_via_permission_set() {
    let read = support::sample_permission("p1", "users", "read");
    let write = support::sample_permission("p2", "users", "write");
    let role = support::sample_role("admin", HashSet::from([read, write]));

    assert!(role.has_permission(
        &Resource::new("users").unwrap(),
        &Action::new("read").unwrap()
    ));
    assert!(role.has_permission(
        &Resource::new("users").unwrap(),
        &Action::new("write").unwrap()
    ));
    assert!(!role.has_permission(
        &Resource::new("roles").unwrap(),
        &Action::new("read").unwrap()
    ));
    assert!(role.is_system_role());
    assert_eq!(role.name().name(), "Admin");
}

#[test]
fn role_builder_requires_all_mandatory_fields() {
    let builder = domain::role::Role::new(RoleId::new("r1"));
    assert!(builder.build().is_err());
}

#[test]
fn role_builder_still_errors_with_only_name() {
    let mut builder = domain::role::Role::new(RoleId::new("r1"));
    builder.set_name(domain::Name::new("Viewer").unwrap());
    assert!(builder.build().is_err());
}

#[test]
fn role_into_parts_roundtrip() {
    let role = support::sample_role("admin", HashSet::new());
    let parts = role.into_parts();
    assert_eq!(parts.id.as_str(), "admin");
    assert_eq!(domain::Event::get_type(&support::sample_role("r1", HashSet::new())), "ROLE");
}

#[test]
fn temporary_grant_permission_checks_and_expiry_fields() {
    let perm = support::sample_permission("p1", "billing", "read");
    let grant = TemporaryGrant::new(
        UserId::new("u1"),
        Description::new("Emergency access").unwrap(),
        HashSet::from([perm]),
        support::ts(200),
        support::ts(100),
        1,
    );

    assert!(grant.has_permission(
        &Resource::new("billing").unwrap(),
        &Action::new("read").unwrap()
    ));
    assert!(!grant.has_permission(
        &Resource::new("billing").unwrap(),
        &Action::new("write").unwrap()
    ));
    assert_eq!(grant.expires_at().datetime(), &200);
    assert_eq!(grant.created_at().datetime(), &100);
    assert!(grant.is_valid(&support::ts(150)));
    assert!(grant.is_valid(&support::ts(200)));
    assert!(grant.is_expired(&support::ts(201)));
    assert!(!grant.is_expired(&support::ts(200)));
    assert_eq!(domain::Event::get_type(&grant), "TEMPORARYGRANT");

    let parts = grant.into_parts();
    assert_eq!(parts.user_id.as_str(), "u1");
    assert_eq!(parts.permissions.len(), 1);
}

#[test]
fn temporary_grant_empty_permissions_never_matches() {
    let grant = TemporaryGrant::new(
        UserId::new("u1"),
        Description::new("No perms").unwrap(),
        HashSet::new(),
        support::ts(200),
        support::ts(100),
        1,
    );
    assert!(!grant.has_permission(
        &Resource::new("users").unwrap(),
        &Action::new("read").unwrap()
    ));
}
