use application::dto::user::command::{UserPreferencesCommand, UserProfileCommand};
use domain::{
    value_objects::{Bio, Language, PhoneNumber, PhoneNumbers, Url},
    Name, Password, Username,
};
use domain::value_objects::password::{HashedPassword, NoneHashedPassword};

use crate::error::AppErrorResponse;

pub fn sanitize_display_name(raw: &str) -> String {
    let mut out = String::new();
    for c in raw.trim().chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            out.push(c);
        } else if c.is_whitespace() && !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.len() < 3 {
        "User".to_string()
    } else {
        trimmed.chars().take(30).collect()
    }
}

pub fn username_from_email_local(local: &str) -> String {
    let mut out = String::new();
    for c in local.trim().chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_').trim_matches('-');
    if trimmed.len() < 3 {
        format!("usr{}", trimmed.chars().take(20).collect::<String>())
    } else {
        trimmed.chars().take(30).collect()
    }
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct UserProfileFields {
    pub username: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "firstName")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName")]
    pub last_name: Option<String>,
    pub bio: Option<String>,
    #[serde(rename = "phoneNumber")]
    pub phone_number: Option<String>,
    pub website: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub password: Option<String>,
    #[serde(rename = "emailNotifications")]
    pub email_notifications: Option<bool>,
    #[serde(rename = "pushNotifications")]
    pub push_notifications: Option<bool>,
    #[serde(rename = "twoFactorAuth")]
    pub two_factor_auth: Option<bool>,
    pub language: Option<String>,
}

impl UserProfileFields {
    pub fn resolve_username(&self, email: &str) -> Result<Username, AppErrorResponse> {
        if let Some(raw) = self.username.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            return Username::new(raw)
                .map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)));
        }
        Username::new(&username_from_email_local(
            email.split('@').next().unwrap_or("user"),
        ))
        .map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))
    }

    pub fn resolve_first_name(&self) -> Result<Name, AppErrorResponse> {
        let raw = self
            .first_name
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| self.name.as_deref().filter(|s| !s.trim().is_empty()))
            .ok_or_else(|| {
                AppErrorResponse::validation("first name required", axum::http::StatusCode::BAD_REQUEST)
            })?;
        Name::new(&sanitize_display_name(raw))
            .map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))
    }

    pub fn resolve_last_name(&self) -> Result<Name, AppErrorResponse> {
        let raw = self
            .last_name
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("User");
        Name::new(raw).map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))
    }

    pub fn profile_command(&self) -> Result<Option<UserProfileCommand>, AppErrorResponse> {
        let has_profile = self.first_name.is_some()
            || self.name.is_some()
            || self.last_name.is_some()
            || self.bio.is_some()
            || self.phone_number.is_some()
            || self.website.is_some()
            || self.avatar_url.is_some()
            || self.password.is_some();
        if !has_profile {
            return Ok(None);
        }
        let mut cmd = UserProfileCommand::default();
        if self.first_name.is_some() || self.name.is_some() {
            cmd.first_name = Some(self.resolve_first_name()?);
        }
        if self.last_name.is_some() || self.name.is_some() || self.first_name.is_some() {
            cmd.last_name = Some(self.resolve_last_name()?);
        }
        if let Some(raw) = self.bio.as_deref().filter(|s| !s.trim().is_empty()) {
            cmd.bio = Some(
                Bio::new(raw).map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))?,
            );
        }
        if let Some(raw) = self.phone_number.as_deref().filter(|s| !s.trim().is_empty()) {
            let phone = PhoneNumber::new("mobile", raw)
                .map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))?;
            let mut phones = PhoneNumbers::new();
            phones.add_phone_number(phone);
            cmd.phone_numbers = Some(phones);
        }
        if let Some(raw) = self.website.as_deref().filter(|s| !s.trim().is_empty()) {
            cmd.website = Some(
                Url::new(raw).map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))?,
            );
        }
        if let Some(raw) = self.avatar_url.as_deref().filter(|s| !s.trim().is_empty()) {
            cmd.avatar_url = Some(
                Url::new(raw).map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))?,
            );
        }
        if let Some(raw) = self.password.as_deref().filter(|s| !s.trim().is_empty()) {
            cmd.password = Some(Password::Hashed(
                HashedPassword::new(raw)
                    .map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))?,
            ));
        }
        Ok(Some(cmd))
    }

    pub fn preferences_command(&self) -> Option<UserPreferencesCommand> {
        if self.email_notifications.is_none()
            && self.push_notifications.is_none()
            && self.two_factor_auth.is_none()
            && self.language.is_none()
        {
            return None;
        }
        Some(UserPreferencesCommand {
            email_notifications: self.email_notifications,
            push_notifications: self.push_notifications,
            two_factor_auth: self.two_factor_auth,
            language: self
                .language
                .as_deref()
                .and_then(|l| Language::new(l).ok()),
        })
    }
}

pub fn default_admin_password() -> Result<Password, AppErrorResponse> {
    Ok(Password::NoneHashed(
        NoneHashedPassword::new("unset-admin-user")
            .map_err(|e| AppErrorResponse::from(application::error::AppError::from(e)))?,
    ))
}
