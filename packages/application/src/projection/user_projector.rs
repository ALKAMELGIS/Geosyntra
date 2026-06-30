use domain::User;

use crate::{
    authorization::access_descriptor::AccessControl,
    dto::user::view::{UserPreferencesView, UserProfileView, UserView},
    projection::fields::user::{UserField, UserPreferencesField, UserProfileField},
};

pub struct UserProjector;

impl UserProjector {
    pub fn from_domain(user: &User) -> UserView {
        let parts = user.clone().into_parts();
        let profile = parts.profile.into_parts();
        let prefs = parts.preferences.into_parts();
        UserView {
            id: Some(parts.id),
            email: Some(parts.email),
            username: Some(parts.username),
            profile: Some(UserProfileView {
                first_name: Some(profile.first_name),
                last_name: Some(profile.last_name),
                bio: profile.bio,
                phone_numbers: Some(profile.phone_numbers),
                avatar_url: profile.avatar_url,
                date_of_birth: profile.date_of_birth,
                addresses: Some(profile.addresses),
                website: profile.website,
                is_deleted: Some(profile.is_deleted),
                created_at: Some(profile.created_at),
                updated_at: Some(profile.updated_at),
            }),
            preferences: Some(UserPreferencesView {
                email_notifications: Some(prefs.email_notifications),
                push_notifications: Some(prefs.push_notifications),
                two_factor_auth: Some(prefs.two_factor_auth),
                language: Some(prefs.language),
            }),
            status: Some(parts.status),
            failed_logins: parts.failed_logins,
            locked_until: parts.locked_until,
            last_login: parts.last_login,
            version: Some(parts.version),
            role: None,
            role_slug: None,
        }
    }

    pub fn apply_access(view: &mut UserView, access: &AccessControl<UserField>) {
        if !access.can_read {
            *view = UserView::default();
            return;
        }

        let readable = &access.readable_fields;
        if !readable.contains(&UserField::Id) {
            view.id = None;
        }
        if !readable.contains(&UserField::Email) {
            view.email = None;
        }
        if !readable.contains(&UserField::Username) {
            view.username = None;
        }
        if !readable.contains(&UserField::Role) {
            view.role = None;
        }
        if !readable.contains(&UserField::RoleSlug) {
            view.role_slug = None;
        }
        if !readable.contains(&UserField::Status) {
            view.status = None;
        }
        if !readable.contains(&UserField::FailedLogins) {
            view.failed_logins = None;
        }
        if !readable.contains(&UserField::LockedUntil) {
            view.locked_until = None;
        }
        if !readable.contains(&UserField::LastLogin) {
            view.last_login = None;
        }
        if !readable.contains(&UserField::Version) {
            view.version = None;
        }

        if let Some(profile) = view.profile.as_mut() {
            Self::apply_profile_access(profile, readable);
            if Self::profile_is_empty(profile) {
                view.profile = None;
            }
        }

        if let Some(prefs) = view.preferences.as_mut() {
            Self::apply_preferences_access(prefs, readable);
            if Self::preferences_is_empty(prefs) {
                view.preferences = None;
            }
        }
    }

    fn apply_profile_access(profile: &mut UserProfileView, readable: &std::collections::HashSet<UserField>) {
        if !readable.contains(&UserField::Profile(UserProfileField::FirstName)) {
            profile.first_name = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::LastName)) {
            profile.last_name = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::Bio)) {
            profile.bio = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::PhoneNumbers)) {
            profile.phone_numbers = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::AvatarUrl)) {
            profile.avatar_url = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::DateOfBirth)) {
            profile.date_of_birth = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::Addresses)) {
            profile.addresses = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::Website)) {
            profile.website = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::IsDeleted)) {
            profile.is_deleted = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::CreatedAt)) {
            profile.created_at = None;
        }
        if !readable.contains(&UserField::Profile(UserProfileField::UpdatedAt)) {
            profile.updated_at = None;
        }
    }

    fn apply_preferences_access(
        prefs: &mut UserPreferencesView,
        readable: &std::collections::HashSet<UserField>,
    ) {
        if !readable.contains(&UserField::Preferences(UserPreferencesField::EmailNotifications)) {
            prefs.email_notifications = None;
        }
        if !readable.contains(&UserField::Preferences(UserPreferencesField::PushNotifications)) {
            prefs.push_notifications = None;
        }
        if !readable.contains(&UserField::Preferences(UserPreferencesField::TwoFactorAuth)) {
            prefs.two_factor_auth = None;
        }
        if !readable.contains(&UserField::Preferences(UserPreferencesField::Language)) {
            prefs.language = None;
        }
    }

    fn profile_is_empty(profile: &UserProfileView) -> bool {
        profile.first_name.is_none()
            && profile.last_name.is_none()
            && profile.bio.is_none()
            && profile.phone_numbers.is_none()
            && profile.avatar_url.is_none()
            && profile.date_of_birth.is_none()
            && profile.addresses.is_none()
            && profile.website.is_none()
            && profile.is_deleted.is_none()
            && profile.created_at.is_none()
            && profile.updated_at.is_none()
    }

    fn preferences_is_empty(prefs: &UserPreferencesView) -> bool {
        prefs.email_notifications.is_none()
            && prefs.push_notifications.is_none()
            && prefs.two_factor_auth.is_none()
            && prefs.language.is_none()
    }

    pub fn present(mut view: UserView, access: &AccessControl<UserField>) -> UserView {
        Self::apply_access(&mut view, access);
        view
    }
}
