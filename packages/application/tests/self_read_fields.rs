use application::{
    authorization::neutral_environment,
    projection::fields::user::{UserField, UserProfileField},
    usecases::field_sets::readable_user_fields,
    SubjectContext,
};
use domain::UserId;

#[test]
fn self_read_includes_profile_fields_without_admin_read() {
    let subject = SubjectContext::new(
        UserId::new("u1"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );
    let fields = readable_user_fields(
        &subject,
        &neutral_environment(),
        "user",
        "read",
        Some(subject.user_id()),
    );
    assert!(fields.contains(&UserField::Profile(UserProfileField::FirstName)));
    assert!(!fields.contains(&UserField::FailedLogins));
}
