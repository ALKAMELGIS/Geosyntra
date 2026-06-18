use domain::{
    user::UserStatus, value_objects::Language, Addresses, Bio, DateTime, Email, Name, Password,
    PhoneNumbers, Url, UserId, Username,
};

#[derive(Debug, Default)]
pub struct UserCommand {
    pub id: Option<UserId>,
    pub email: Option<Email>,
    pub username: Option<Username>,
    pub profile: Option<UserProfileCommand>,
    pub preferences: Option<UserPreferencesCommand>,
    pub status: Option<UserStatus>,
    /// Display role for `admin_users.role` on create (H12).
    pub role_display: Option<String>,
    pub version: Option<u64>,
}

#[derive(Debug, Default)]
pub struct UserProfileCommand {
    pub first_name: Option<Name>,
    pub last_name: Option<Name>,
    pub password: Option<Password>,
    pub bio: Option<Bio>,
    pub phone_numbers: Option<PhoneNumbers>,
    pub avatar_url: Option<Url>,
    pub date_of_birth: Option<DateTime>,
    pub addresses: Option<Addresses>,
    pub website: Option<Url>,
}

#[derive(Debug, Default)]
pub struct UserPreferencesCommand {
    pub email_notifications: Option<bool>,
    pub push_notifications: Option<bool>,
    pub two_factor_auth: Option<bool>,
    pub language: Option<Language>,
}
