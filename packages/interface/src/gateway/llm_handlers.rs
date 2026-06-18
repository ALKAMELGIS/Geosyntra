use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde_json::Value;

use crate::{
    config::token_configured,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

pub async fn gemini_generate_content(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !token_configured("gemini") {
        return Err(AppErrorResponse::validation(
            "gemini_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let system = body
        .get("systemInstruction")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let contents = body
        .get("contents")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if system.is_empty() && !contents {
        return Err(AppErrorResponse::validation(
            "contents_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "gemini_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

pub async fn openai_chat(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !token_configured("openai") {
        return Err(AppErrorResponse::validation(
            "openai_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let messages = body
        .get("messages")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if !messages {
        return Err(AppErrorResponse::validation(
            "messages_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "openai_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

fn claude_messages_nonempty(body: &Value) -> bool {
    let user = body
        .get("userMessage")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some();
    let turns = body
        .get("turns")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    user || turns
}

pub async fn claude_messages(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !token_configured("claude") {
        return Err(AppErrorResponse::validation(
            "claude_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    if !claude_messages_nonempty(&body) {
        return Err(AppErrorResponse::validation(
            "messages_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "claude_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

pub async fn deepseek_chat(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !token_configured("deepseek") {
        return Err(AppErrorResponse::validation(
            "deepseek_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    if !claude_messages_nonempty(&body) {
        return Err(AppErrorResponse::validation(
            "messages_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "deepseek_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}
