use serde::Deserialize;
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct UserApiToken {
    pub provider: String,
    pub configured: Option<bool>,
    pub active: Option<bool>,
    pub masked: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListTokensResponse {
    ok: Option<bool>,
    tokens: Option<Vec<UserApiToken>>,
}

#[derive(Debug, Deserialize)]
struct TokenMutationResponse {
    ok: Option<bool>,
    message: Option<String>,
    error: Option<String>,
}

pub async fn list_user_tokens(token: &str) -> Result<Vec<UserApiToken>, ApiError> {
    let client = ApiClient::from_env();
    let data: ListTokensResponse = client
        .get_json("/api/user/api-tokens", Some(token))
        .await?;
    Ok(data.tokens.unwrap_or_default())
}

pub async fn upsert_user_token(
    token: &str,
    provider: &str,
    value: &str,
) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/user/api-tokens/{}",
        urlencoding::encode(provider.trim())
    );
    let body = json!({ "value": value.trim() });
    let data: TokenMutationResponse = client.put_json(&path, &body, Some(token)).await?;
    if data.ok == Some(true) {
        return Ok(());
    }
    Err(ApiError::Http {
        status: 400,
        message: data
            .message
            .or(data.error)
            .unwrap_or_else(|| "Failed to save token".into()),
    })
}

pub async fn delete_user_token(token: &str, provider: &str) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/user/api-tokens/{}",
        urlencoding::encode(provider.trim())
    );
    let data: TokenMutationResponse = client.delete_json(&path, Some(token)).await?;
    if data.ok == Some(true) {
        return Ok(());
    }
    Err(ApiError::Http {
        status: 400,
        message: data
            .message
            .or(data.error)
            .unwrap_or_else(|| "Failed to delete token".into()),
    })
}
