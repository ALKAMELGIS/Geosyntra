use serde::Deserialize;
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct TeamInvite {
    pub email: Option<String>,
    pub role: Option<String>,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
    pub status: Option<String>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<String>,
    #[serde(rename = "acceptedAt")]
    pub accepted_at: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListInvitesResponse {
    invites: Vec<TeamInvite>,
}

#[derive(Debug, Deserialize)]
struct CreateInviteResponse {
    token: Option<String>,
    #[serde(rename = "roleSlug")]
    role_slug: Option<String>,
}

pub async fn list_invites(token: &str) -> Result<Vec<TeamInvite>, ApiError> {
    let client = ApiClient::from_env();
    let data: ListInvitesResponse = client
        .get_json("/api/rbac/invites", Some(token))
        .await?;
    Ok(data.invites)
}

pub async fn create_invite(
    token: &str,
    email: &str,
    role_slug: &str,
) -> Result<Option<String>, ApiError> {
    let client = ApiClient::from_env();
    let data: CreateInviteResponse = client
        .post_json(
            "/api/rbac/invites",
            &json!({ "email": email.trim(), "roleSlug": role_slug }),
            Some(token),
        )
        .await?;
    Ok(data.token)
}

pub const INVITE_ROLE_OPTIONS: &[(&str, &str)] = &[
    ("admin", "Admin"),
    ("manager", "Manager"),
    ("analyst", "Analyst"),
    ("ai_operator", "AI Operator"),
    ("viewer", "Viewer"),
    ("trial_user", "Trial User"),
];

impl TeamInvite {
    pub fn is_pending(&self) -> bool {
        self.status
            .as_deref()
            .is_some_and(|s| s.eq_ignore_ascii_case("pending"))
    }
}
