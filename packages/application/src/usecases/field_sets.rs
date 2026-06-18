//! Field catalogs and subject-driven readable sets for projection.
//!
//! Field visibility is derived from the same domain permissions as phase-1 auth
//! (`map_use_case_to_domain`) plus permission implications (e.g. `manage` → read-level fields).

use std::collections::HashSet;

use domain::{Action, Resource, UserId, tenant::environment::Environment};

use crate::{
    authorization::map_use_case_to_domain,
    projection::fields::{
        auth::PublicUserField,
        membership::MembershipField,
        role::RoleField,
        user::{UserField, UserPreferencesField, UserProfileField},
    },
    SubjectContext,
};

pub const PUBLIC_USER_ALL_FIELDS: &[PublicUserField] = &[
    PublicUserField::Id,
    PublicUserField::Email,
    PublicUserField::Name,
    PublicUserField::Role,
    PublicUserField::RoleSlug,
    PublicUserField::Status,
];

pub const USER_ROLE_FIELDS: &[UserField] = &[UserField::Role, UserField::RoleSlug];

pub const USER_PUBLIC_FIELDS: &[UserField] = &[
    UserField::Id,
    UserField::Email,
    UserField::Username,
    UserField::Status,
];

pub const USER_DETAIL_FIELDS: &[UserField] = &[
    UserField::Profile(UserProfileField::FirstName),
    UserField::Profile(UserProfileField::LastName),
    UserField::Profile(UserProfileField::Bio),
    UserField::Profile(UserProfileField::PhoneNumbers),
    UserField::Profile(UserProfileField::AvatarUrl),
    UserField::Profile(UserProfileField::DateOfBirth),
    UserField::Profile(UserProfileField::Addresses),
    UserField::Profile(UserProfileField::Website),
    UserField::Profile(UserProfileField::IsDeleted),
    UserField::Profile(UserProfileField::CreatedAt),
    UserField::Profile(UserProfileField::UpdatedAt),
    UserField::Preferences(UserPreferencesField::EmailNotifications),
    UserField::Preferences(UserPreferencesField::PushNotifications),
    UserField::Preferences(UserPreferencesField::TwoFactorAuth),
    UserField::Preferences(UserPreferencesField::Language),
    UserField::LastLogin,
    UserField::Version,
];

pub const USER_SECURITY_FIELDS: &[UserField] = &[
    UserField::FailedLogins,
    UserField::LockedUntil,
];

pub const USER_ALL_FIELDS: &[UserField] = &[
    UserField::Id,
    UserField::Email,
    UserField::Username,
    UserField::Profile(UserProfileField::FirstName),
    UserField::Profile(UserProfileField::LastName),
    UserField::Profile(UserProfileField::Bio),
    UserField::Profile(UserProfileField::PhoneNumbers),
    UserField::Profile(UserProfileField::AvatarUrl),
    UserField::Profile(UserProfileField::DateOfBirth),
    UserField::Profile(UserProfileField::Addresses),
    UserField::Profile(UserProfileField::Website),
    UserField::Profile(UserProfileField::IsDeleted),
    UserField::Profile(UserProfileField::CreatedAt),
    UserField::Profile(UserProfileField::UpdatedAt),
    UserField::Preferences(UserPreferencesField::EmailNotifications),
    UserField::Preferences(UserPreferencesField::PushNotifications),
    UserField::Preferences(UserPreferencesField::TwoFactorAuth),
    UserField::Preferences(UserPreferencesField::Language),
    UserField::Status,
    UserField::FailedLogins,
    UserField::LockedUntil,
    UserField::LastLogin,
    UserField::Version,
];

pub const ROLE_PUBLIC_FIELDS: &[RoleField] = &[RoleField::Id, RoleField::Name];

pub const ROLE_DETAIL_FIELDS: &[RoleField] = &[
    RoleField::Description,
    RoleField::IsSystemRole,
    RoleField::CreatedAt,
    RoleField::Version,
];

pub const ROLE_ALL_FIELDS: &[RoleField] = &[
    RoleField::Id,
    RoleField::Name,
    RoleField::Description,
    RoleField::IsSystemRole,
    RoleField::CreatedAt,
    RoleField::Version,
];

pub const MEMBERSHIP_PUBLIC_FIELDS: &[MembershipField] = &[
    MembershipField::UserId,
    MembershipField::TenantId,
];

pub const MEMBERSHIP_DETAIL_FIELDS: &[MembershipField] = &[
    MembershipField::Roles,
    MembershipField::CreatedAt,
    MembershipField::Version,
];

fn admin_users_resource() -> Resource {
    Resource::new("admin_users").expect("valid resource")
}

fn admin_roles_resource() -> Resource {
    Resource::new("admin_roles").expect("valid resource")
}

fn admin_panel_resource() -> Resource {
    Resource::new("admin_panel").expect("valid resource")
}

fn read_action() -> Action {
    Action::new("read").expect("valid action")
}

fn manage_action() -> Action {
    Action::new("manage").expect("valid action")
}

fn assign_action() -> Action {
    Action::new("assign").expect("valid action")
}

fn access_action() -> Action {
    Action::new("access").expect("valid action")
}

fn extend<T: Eq + std::hash::Hash + Copy>(target: &mut HashSet<T>, fields: &[T]) {
    target.extend(fields.iter().copied());
}

/// Readable user fields — aligned with use-case resource/action and permission implications.
///
/// When `target_user_id` matches the subject, profile/detail fields are granted without
/// `admin_users.read` (self-service read); security fields still require manage permission.
pub fn readable_user_fields(
    subject: &SubjectContext,
    env: &Environment,
    use_case_resource: &str,
    use_case_action: &str,
    target_user_id: Option<&UserId>,
) -> HashSet<UserField> {
    let now = env.time().timestamp();
    let mut fields: HashSet<UserField> = USER_PUBLIC_FIELDS.iter().copied().collect();
    let admin_users = admin_users_resource();
    let read = read_action();
    let manage = manage_action();

    let is_self = target_user_id
        .is_some_and(|id| id.as_str() == subject.user_id().as_str());

    let can_read = subject.has_permission(&admin_users, &read, now);
    let can_manage = subject.has_permission(&admin_users, &manage, now);

    if is_self {
        extend(&mut fields, USER_DETAIL_FIELDS);
    }

    // manage implies read-level visibility for the same aggregate
    if can_read || can_manage {
        extend(&mut fields, USER_DETAIL_FIELDS);
        extend(&mut fields, USER_ROLE_FIELDS);
    }
    if can_manage {
        extend(&mut fields, USER_SECURITY_FIELDS);
    }

    if let Ok((domain_resource, domain_action)) =
        map_use_case_to_domain(use_case_resource, use_case_action)
        && subject.has_permission(&domain_resource, &domain_action, now)
    {
        match domain_action.action() {
            "read" => {
                extend(&mut fields, USER_DETAIL_FIELDS);
                extend(&mut fields, USER_ROLE_FIELDS);
            }
            "manage" => {
                extend(&mut fields, USER_DETAIL_FIELDS);
                extend(&mut fields, USER_SECURITY_FIELDS);
                extend(&mut fields, USER_ROLE_FIELDS);
            }
            _ => {}
        }
    }

    fields
}

/// Readable auth profile fields — self-read grants all public auth fields.
pub fn readable_public_user_fields(
    subject: &SubjectContext,
    env: &Environment,
    use_case_resource: &str,
    use_case_action: &str,
    target_user_id: Option<&UserId>,
) -> HashSet<PublicUserField> {
    let now = env.time().timestamp();
    let mut fields: HashSet<PublicUserField> = HashSet::new();
    fields.insert(PublicUserField::Id);

    let is_self = target_user_id
        .is_some_and(|id| id.as_str() == subject.user_id().as_str());

    if is_self {
        fields.extend(PUBLIC_USER_ALL_FIELDS.iter().copied());
        return fields;
    }

    let admin_users = admin_users_resource();
    let read = read_action();
    if subject.has_permission(&admin_users, &read, now) {
        fields.extend(PUBLIC_USER_ALL_FIELDS.iter().copied());
    }

    if let Ok((domain_resource, domain_action)) =
        map_use_case_to_domain(use_case_resource, use_case_action)
        && subject.has_permission(&domain_resource, &domain_action, now)
    {
        fields.extend(PUBLIC_USER_ALL_FIELDS.iter().copied());
    }

    fields
}

/// Readable role fields — assign implies panel-level detail visibility.
pub fn readable_role_fields(
    subject: &SubjectContext,
    env: &Environment,
    use_case_resource: &str,
    use_case_action: &str,
    _target_user_id: Option<&UserId>,
) -> HashSet<RoleField> {
    let now = env.time().timestamp();
    let mut fields: HashSet<RoleField> = ROLE_PUBLIC_FIELDS.iter().copied().collect();
    let panel = admin_panel_resource();
    let roles = admin_roles_resource();
    let access = access_action();
    let assign = assign_action();

    let can_access = subject.has_permission(&panel, &access, now);
    let can_assign = subject.has_permission(&roles, &assign, now);

    if can_access || can_assign {
        extend(&mut fields, ROLE_DETAIL_FIELDS);
    }

    if let Ok((domain_resource, domain_action)) =
        map_use_case_to_domain(use_case_resource, use_case_action)
        && subject.has_permission(&domain_resource, &domain_action, now)
    {
        match domain_action.action() {
            "access" | "assign" => extend(&mut fields, ROLE_DETAIL_FIELDS),
            _ => {}
        }
    }

    fields
}

/// Readable membership fields — assign implies role list visibility.
pub fn readable_membership_fields(
    subject: &SubjectContext,
    env: &Environment,
    use_case_resource: &str,
    use_case_action: &str,
    _target_user_id: Option<&UserId>,
) -> HashSet<MembershipField> {
    let now = env.time().timestamp();
    let mut fields: HashSet<MembershipField> = MEMBERSHIP_PUBLIC_FIELDS.iter().copied().collect();
    let admin_users = admin_users_resource();
    let roles = admin_roles_resource();
    let read = read_action();
    let assign = assign_action();

    let can_read = subject.has_permission(&admin_users, &read, now);
    let can_assign = subject.has_permission(&roles, &assign, now);

    if can_read || can_assign {
        extend(&mut fields, MEMBERSHIP_DETAIL_FIELDS);
    }

    if let Ok((domain_resource, domain_action)) =
        map_use_case_to_domain(use_case_resource, use_case_action)
        && subject.has_permission(&domain_resource, &domain_action, now)
    {
        match domain_action.action() {
            "access" | "assign" => extend(&mut fields, MEMBERSHIP_DETAIL_FIELDS),
            _ => {}
        }
    }

    fields
}

#[cfg(test)]
mod tests {
    use domain::{DateTime, Description, Name, Permission, PermissionId, Role, RoleId};

    use super::*;

    fn role_with(resource: &str, action: &str) -> Role {
        let mut builder = Role::new(RoleId::new("r1"));
        builder
            .set_name(Name::new("Admin").unwrap())
            .set_description(Description::new("Admin").unwrap())
            .add_permission(Permission::new(
                PermissionId::new("p1"),
                Resource::new(resource).unwrap(),
                Action::new(action).unwrap(),
                Description::new("perm").unwrap(),
                DateTime::new(0),
                1,
            ))
            .set_is_system_role(true)
            .set_created_at(DateTime::new(0));
        builder.build().unwrap()
    }

    fn sample_env() -> Environment {
        crate::authorization::neutral_environment()
    }

    #[test]
    fn readable_user_fields_includes_detail_when_subject_can_read() {
        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[role_with("admin_users", "read")],
            &[],
        );
        let fields = readable_user_fields(&subject, &sample_env(), "user", "read", Some(&UserId::new("u1")));
        assert!(fields.contains(&UserField::Version));
        assert!(!fields.contains(&UserField::FailedLogins));
    }

    #[test]
    fn readable_user_fields_self_read_grants_detail_not_security() {
        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[],
            &[],
        );
        let fields = readable_user_fields(
            &subject,
            &sample_env(),
            "user",
            "read",
            Some(subject.user_id()),
        );
        assert!(fields.contains(&UserField::Version));
        assert!(!fields.contains(&UserField::FailedLogins));
    }

    #[test]
    fn readable_user_fields_manage_implies_detail_and_security() {
        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[role_with("admin_users", "manage")],
            &[],
        );
        let fields = readable_user_fields(&subject, &sample_env(), "user", "update", None);
        assert!(fields.contains(&UserField::Version));
        assert!(fields.contains(&UserField::FailedLogins));
    }

    #[test]
    fn readable_role_fields_assign_implies_detail() {
        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[role_with("admin_roles", "assign")],
            &[],
        );
        let fields = readable_role_fields(&subject, &sample_env(), "role", "create", None);
        assert!(fields.contains(&RoleField::Description));
    }
}
