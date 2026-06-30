use std::collections::HashSet;

use application::{
    authorization::{field_access::FieldAccessResolver, AccessDecision},
    projection::fields::user::UserField,
    usecases::field_sets::USER_PUBLIC_FIELDS,
};

#[test]
fn field_access_resolver_allow_yields_requested_fields() {
    let readable: HashSet<UserField> = USER_PUBLIC_FIELDS.iter().copied().collect();
    let access = FieldAccessResolver::resolve(AccessDecision::Allow, readable).unwrap();
    assert!(access.can_read);
    assert_eq!(access.readable_fields.len(), 4);
    assert!(!access.readable_fields.contains(&UserField::Version));
}

#[test]
fn field_access_resolver_deny_yields_empty_access() {
    let readable: HashSet<UserField> = USER_PUBLIC_FIELDS.iter().copied().collect();
    let access = FieldAccessResolver::resolve(AccessDecision::Deny, readable).unwrap();
    assert!(!access.can_read);
    assert!(access.readable_fields.is_empty());
}

#[test]
fn field_access_resolver_passes_through_subject_derived_set() {
    let mut readable: HashSet<UserField> = USER_PUBLIC_FIELDS.iter().copied().collect();
    readable.insert(UserField::FailedLogins);
    let access = FieldAccessResolver::resolve(AccessDecision::Allow, readable).unwrap();
    assert!(access.readable_fields.contains(&UserField::FailedLogins));
}
