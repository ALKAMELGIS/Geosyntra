use std::collections::HashSet;

use application::{
    authorization::{field_access::FieldAccessResolver, access_descriptor::AccessControl, AccessDecision},
    dto::user::view::UserView,
    projection::{
        fields::user::UserField,
        UserProjector,
    },
    usecases::field_sets::USER_PUBLIC_FIELDS,
};
use domain::UserId;

#[test]
fn user_projector_strips_fields_not_granted_by_policy() {
    let readable: HashSet<UserField> = USER_PUBLIC_FIELDS.iter().copied().collect();
    let access = FieldAccessResolver::resolve(AccessDecision::Allow, readable).unwrap();

    let mut view = UserView {
        id: Some(UserId::new("u1")),
        email: Some(domain::Email::new("a@b.c").unwrap()),
        failed_logins: Some(3),
        version: Some(9),
        ..Default::default()
    };
    UserProjector::apply_access(&mut view, &access);
    assert!(view.id.is_some());
    assert!(view.email.is_some());
    assert!(view.failed_logins.is_none());
    assert!(view.version.is_none());
}

#[test]
fn user_projector_deny_clears_view() {
    let access = AccessControl::new(false, HashSet::new(), HashSet::new());
    let mut view = UserView {
        id: Some(UserId::new("u1")),
        ..Default::default()
    };
    UserProjector::apply_access(&mut view, &access);
    assert!(view.id.is_none());
}
