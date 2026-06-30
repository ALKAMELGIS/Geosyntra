mod support;

use domain::error::{DomainError, PermissionError, RoleError, UserError};
use domain::shared::shared_str::SharedStr;
use std::borrow::Cow;

#[test]
fn domain_error_variants_display() {
    let validation = DomainError::ValidationError("bad input".into());
    assert!(validation.to_string().contains("bad input"));

    let user = DomainError::UserError(UserError::NotFound);
    assert!(user.to_string().contains("User not found"));

    let role = DomainError::RoleError(RoleError::NotFound);
    assert!(role.to_string().contains("Role not found"));

    let perm = DomainError::PermissionError(PermissionError::NotFound);
    assert!(perm.to_string().contains("Permission not found"));
}

#[test]
fn shared_str_from_multiple_sources() {
    assert_eq!(SharedStr::from("a").as_ref(), "a");
    assert_eq!(SharedStr::from(String::from("b")).as_ref(), "b");
    assert_eq!(SharedStr::from(Cow::Borrowed("c")).as_ref(), "c");
    assert_eq!(SharedStr::from(Cow::Owned("d".into())).as_ref(), "d");
    assert_eq!(SharedStr::from('x').as_ref(), "x");
}

#[test]
fn user_id_deref_and_as_str() {
    let id = domain::UserId::new("user-42");
    assert_eq!(id.as_str(), "user-42");
    assert_eq!(&*id, "user-42");
}

#[test]
fn tenant_id_display_and_hash() {
    use std::collections::HashSet;
    let a = domain::TenantId::new("t1");
    let b = domain::TenantId::new("t1");
    let set = HashSet::from([a]);
    assert!(set.contains(&b));
}
