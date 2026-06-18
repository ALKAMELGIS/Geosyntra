use serde::{Deserialize, Serialize};

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq, Default)]
pub struct AdminUser {
    pub id: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "firstName", default)]
    pub first_name: Option<String>,
    #[serde(rename = "lastName", default)]
    pub last_name: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(rename = "phoneNumber", default)]
    pub phone_number: Option<String>,
    #[serde(default)]
    pub website: Option<String>,
    #[serde(rename = "avatarUrl", default)]
    pub avatar_url: Option<String>,
    #[serde(rename = "emailNotifications", default)]
    pub email_notifications: Option<bool>,
    #[serde(rename = "pushNotifications", default)]
    pub push_notifications: Option<bool>,
    #[serde(rename = "twoFactorAuth", default)]
    pub two_factor_auth: Option<bool>,
    #[serde(default)]
    pub language: Option<String>,
    pub role: Option<String>,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UserPatch {
    pub name: Option<String>,
    #[serde(rename = "firstName", skip_serializing_if = "Option::is_none")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName", skip_serializing_if = "Option::is_none")]
    pub last_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(rename = "roleSlug", skip_serializing_if = "Option::is_none")]
    pub role_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(rename = "phoneNumber", skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(rename = "avatarUrl", skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(rename = "emailNotifications", skip_serializing_if = "Option::is_none")]
    pub email_notifications: Option<bool>,
    #[serde(rename = "pushNotifications", skip_serializing_if = "Option::is_none")]
    pub push_notifications: Option<bool>,
    #[serde(rename = "twoFactorAuth", skip_serializing_if = "Option::is_none")]
    pub two_factor_auth: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListUsersResponse {
    users: Vec<AdminUser>,
}

pub async fn list_users(token: &str) -> Result<Vec<AdminUser>, ApiError> {
    let client = ApiClient::from_env();
    let data: ListUsersResponse = client
        .get_json("/api/rbac/users", Some(token))
        .await?;
    Ok(data.users)
}

pub async fn approve_user(token: &str, id: &str) -> Result<(), ApiError> {
    post_action(token, id, "approve").await
}

pub async fn suspend_user(token: &str, id: &str) -> Result<(), ApiError> {
    post_action(token, id, "suspend").await
}

pub async fn reactivate_user(token: &str, id: &str) -> Result<(), ApiError> {
    post_action(token, id, "reactivate").await
}

pub async fn create_user(
    token: &str,
    email: &str,
    first_name: &str,
    last_name: &str,
    username: Option<&str>,
    role_slug: &str,
) -> Result<AdminUser, ApiError> {
    let client = ApiClient::from_env();
    let mut body = serde_json::json!({
        "email": email,
        "firstName": first_name,
        "lastName": last_name,
        "name": first_name,
        "roleSlug": role_slug,
    });
    if let Some(u) = username.filter(|s| !s.is_empty()) {
        body["username"] = serde_json::json!(u);
    }
    let resp: serde_json::Value = client
        .post_json("/api/rbac/users", &body, Some(token))
        .await?;
    serde_json::from_value(resp.get("user").cloned().unwrap_or(serde_json::json!({})))
        .map_err(|e| ApiError::Parse {
            message: e.to_string(),
        })
}

pub async fn update_user(token: &str, id: &str, patch: &UserPatch) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let body = serde_json::to_value(patch).map_err(|e| ApiError::Parse {
        message: e.to_string(),
    })?;
    let _: serde_json::Value = client
        .patch_json(&format!("/api/rbac/users/{id}"), &body, Some(token))
        .await?;
    Ok(())
}

pub async fn delete_user(token: &str, id: &str) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let _: serde_json::Value = client
        .delete_json(&format!("/api/rbac/users/{id}"), Some(token))
        .await?;
    Ok(())
}

async fn post_action(token: &str, id: &str, action: &str) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let _: serde_json::Value = client
        .post_empty(&format!("/api/rbac/users/{id}/{action}"), Some(token))
        .await?;
    Ok(())
}

impl AdminUser {
    pub fn display_name(&self) -> String {
        self.first_name
            .clone()
            .or_else(|| self.name.clone())
            .or_else(|| self.email.clone())
            .unwrap_or_else(|| "User".into())
    }

    pub fn is_pending(&self) -> bool {
        self.status
            .as_deref()
            .is_some_and(|s| s.contains("Pending") || s.eq_ignore_ascii_case("inactive"))
    }

    pub fn is_suspended(&self) -> bool {
        self.status
            .as_deref()
            .is_some_and(|s| s.eq_ignore_ascii_case("suspended"))
    }
}
