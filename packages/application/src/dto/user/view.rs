use domain::{
    user::UserStatus, value_objects::Language, Addresses, Bio, DateTime, Email, Name,
    PhoneNumbers, Url, UserId, Username,
};

#[derive(Debug, Clone, Default)]
pub struct UserView {
    pub id: Option<UserId>,
    pub email: Option<Email>,
    pub username: Option<Username>,
    pub profile: Option<UserProfileView>,
    pub preferences: Option<UserPreferencesView>,
    pub status: Option<UserStatus>,
    /// RBAC display label from `admin_users.role` (M13).
    pub role: Option<String>,
    /// Normalized slug derived from role display.
    pub role_slug: Option<String>,
    pub failed_logins: Option<u64>,
    pub locked_until: Option<DateTime>,
    pub last_login: Option<DateTime>,
    pub version: Option<u64>,
}

#[derive(Debug, Clone, Default)]
pub struct UserProfileView {
    pub first_name: Option<Name>,
    pub last_name: Option<Name>,
    pub bio: Option<Bio>,
    pub phone_numbers: Option<PhoneNumbers>,
    pub avatar_url: Option<Url>,
    pub date_of_birth: Option<DateTime>,
    pub addresses: Option<Addresses>,
    pub website: Option<Url>,
    pub is_deleted: Option<bool>,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}

#[derive(Debug, Clone, Default)]
pub struct UserPreferencesView {
    pub email_notifications: Option<bool>,
    pub push_notifications: Option<bool>,
    pub two_factor_auth: Option<bool>,
    pub language: Option<Language>,
}
