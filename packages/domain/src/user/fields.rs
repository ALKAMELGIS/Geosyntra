use crate::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UserField {
    Id,
    Email,
    Username,
    Profile(UserProfileField),
    Preferences(UserPreferencesField),
    Status,
    FailedLogins,
    LockedUntil,
    LastLogin,
    Version,
}

impl Field for UserField {
    fn name(&self) -> &'static str {
        match self {
            UserField::Id => "id",
            UserField::Email => "email",
            UserField::Username => "username",
            UserField::Profile(_) => "profile",
            UserField::Preferences(_) => "preferences",
            UserField::Status => "status",
            UserField::FailedLogins => "failed_logins",
            UserField::LockedUntil => "locked_until",
            UserField::LastLogin => "last_login",
            UserField::Version => "version",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UserProfileField {
    FirstName,
    LastName,
    Bio,
    PhoneNumbers,
    AvatarUrl,
    DateOfBirth,
    Addresses,
    Website,
    IsDeleted,
    CreatedAt,
    UpdatedAt,
}

impl Field for UserProfileField {
    fn name(&self) -> &'static str {
        match self {
            UserProfileField::FirstName => "first_name",
            UserProfileField::LastName => "last_name",
            UserProfileField::Bio => "bio",
            UserProfileField::PhoneNumbers => "phone_numbers",
            UserProfileField::AvatarUrl => "avatar_url",
            UserProfileField::DateOfBirth => "date_of_birth",
            UserProfileField::Addresses => "addresses",
            UserProfileField::Website => "website",
            UserProfileField::IsDeleted => "is_deleted",
            UserProfileField::CreatedAt => "created_at",
            UserProfileField::UpdatedAt => "updated_at",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UserPreferencesField {
    EmailNotifications,
    PushNotifications,
    TwoFactorAuth,
    Language,
}

impl Field for UserPreferencesField {
    fn name(&self) -> &'static str {
        match self {
            UserPreferencesField::EmailNotifications => "email_notifications",
            UserPreferencesField::PushNotifications => "push_notifications",
            UserPreferencesField::TwoFactorAuth => "two_factor_auth",
            UserPreferencesField::Language => "language",
        }
    }
}
