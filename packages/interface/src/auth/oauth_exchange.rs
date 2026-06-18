use axum::{http::StatusCode, Json};
use serde_json::Value;

use crate::{env_config, error::AppErrorResponse};

fn missing_code_error(provider: &str) -> AppErrorResponse {
    let error = match provider {
        "google" => "oauth_google_missing_config_or_code",
        "github" => "oauth_github_missing_config_or_code",
        "linkedin" => "oauth_linkedin_missing_config_or_code",
        _ => "oauth_missing_config_or_code",
    };
    AppErrorResponse::validation(error, StatusCode::BAD_REQUEST)
}

fn exchange_stub(provider: &str, body: &Value) -> Result<Json<Value>, AppErrorResponse> {
    let code = body
        .get("code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if code.is_empty() || !env_config::is_oauth_provider_configured(provider) {
        return Err(missing_code_error(provider));
    }
    Err(AppErrorResponse::validation(
        format!("oauth_{provider}_not_implemented"),
        StatusCode::NOT_IMPLEMENTED,
    ))
}

pub async fn google_exchange(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    exchange_stub("google", &body)
}

pub async fn github_exchange(Json(body): Json<Value>) -> Result<Json<Value>, AppErrorResponse> {
    exchange_stub("github", &body)
}

pub async fn linkedin_exchange(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    exchange_stub("linkedin", &body)
}

pub async fn apple_exchange(Json(body): Json<Value>) -> Result<Json<Value>, AppErrorResponse> {
    let code = body
        .get("code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let identity_token = body
        .get("identity_token")
        .or_else(|| body.get("identityToken"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if code.is_empty() && identity_token.is_empty() {
        return Err(AppErrorResponse::validation(
            "apple_oauth_missing_config_or_token",
            StatusCode::BAD_REQUEST,
        ));
    }
    if env_config::trim_env_public("APPLE_OAUTH_CLIENT_ID")
        .filter(|v| !v.is_empty())
        .is_none()
    {
        return Err(AppErrorResponse::validation(
            "apple_oauth_missing_server_keys",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "oauth_apple_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}
