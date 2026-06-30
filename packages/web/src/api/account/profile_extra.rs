use serde::Deserialize;
use serde_json::{json, Value};

use crate::{api_client::ApiClient, error_display::ApiError};

pub async fn fetch_profile_extra(token: &str, email: &str) -> Result<Value, ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/v1/account/profile-extra?email={}",
        urlencoding::encode(email.trim())
    );
    let data: ProfileExtraResponse = client.get_json(&path, Some(token)).await?;
    Ok(data.profile.unwrap_or_else(|| json!({})))
}

pub async fn put_profile_extra(
    token: &str,
    email: &str,
    profile: &Value,
) -> Result<Value, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "email": email.trim(), "profile": profile });
    let data: ProfileExtraResponse = client
        .put_json("/api/v1/account/profile-extra", &body, Some(token))
        .await?;
    Ok(data.profile.unwrap_or_else(|| json!({})))
}

#[derive(Debug, Deserialize)]
struct ProfileExtraResponse {
    ok: Option<bool>,
    profile: Option<Value>,
}
