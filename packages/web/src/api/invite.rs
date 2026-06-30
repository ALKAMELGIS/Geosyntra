use serde::Deserialize;
use serde_json::json;

use crate::{
    api_client::ApiClient,
    auth_api,
    auth_session::AuthSession,
    error_display::ApiError,
};

#[derive(Debug, Clone, Deserialize)]
pub struct InvitePreview {
    pub email: Option<String>,
    pub role: Option<String>,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PreviewResponse {
    invite: Option<InvitePreview>,
}

#[derive(Debug, Deserialize)]
struct AcceptResponse {
    user: auth_api::LoginUserRaw,
    #[serde(default, alias = "accessToken")]
    access_token: Option<String>,
    #[serde(default, alias = "refreshToken")]
    refresh_token: Option<String>,
}

pub async fn preview_invite(token: &str) -> Result<InvitePreview, ApiError> {
    let client = ApiClient::from_env();
    let path = format!("/api/rbac/invites/preview?token={}", url_encode(token));
    let data: PreviewResponse = client.get_json(&path, None).await?;
    data.invite.ok_or_else(|| ApiError::Http {
        status: 404,
        message: "Invalid invitation".into(),
    })
}

pub async fn accept_invite(
    token: &str,
    name: &str,
    password: &str,
) -> Result<AuthSession, ApiError> {
    let client = ApiClient::from_env();
    let data: AcceptResponse = client
        .post_json(
            "/api/rbac/invites/accept",
            &json!({
                "token": token,
                "name": name.trim(),
                "password": password,
            }),
            None,
        )
        .await?;
    let access = data.access_token.ok_or_else(|| ApiError::Parse {
        message: "accept response missing access_token".into(),
    })?;
    Ok(auth_api::session_from_user(
        data.user,
        access,
        data.refresh_token,
    ))
}

fn url_encode(raw: &str) -> String {
    raw.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}
