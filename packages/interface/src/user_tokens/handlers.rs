use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    config,
    env_config,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

pub(crate) fn is_platform_owner(ctx: &application::SubjectContext) -> bool {
    ctx.roles().iter().any(|role| {
        let id = role.id().as_str();
        id == "owner" || id.ends_with(":owner") || role.name().name() == "Owner"
    })
}

/// Session token hydration — DB-backed capabilities with optional client hydration in dev.
pub async fn api_tokens_session(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    let owner = is_platform_owner(&ctx);
    let allow_hydration = env_config::trim_env_public("GEOSYNTRA_ALLOW_CLIENT_SECRET_HYDRATION")
        .as_deref()
        == Some("true");
    let capabilities = state.tokens.capabilities_snapshot().await?;
    Ok(Json(json!({
        "ok": true,
        "revision": 1,
        "persisted": state.tokens.ready(),
        "capabilities": capabilities,
        "encrypted": state.tokens.encrypted_at_rest(),
        "readOnly": !owner,
        "gatewayMode": !allow_hydration,
    })))
}

pub async fn list_api_tokens(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    if !state.tokens.ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let user_id = ctx.user_id().as_str().to_string();
    let rows = state.tokens.list_user_tokens(&user_id).await?;
    let tokens: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "provider": r.provider,
                "configured": r.configured,
                "active": r.active,
                "masked": r.masked,
            })
        })
        .collect();
    Ok(Json(json!({ "ok": true, "tokens": tokens })))
}

#[derive(Debug, Deserialize)]
pub struct UpsertUserTokenRequest {
    pub value: Option<String>,
}

pub async fn upsert_api_token(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(provider): Path<String>,
    Json(body): Json<UpsertUserTokenRequest>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    let provider = provider.trim().to_lowercase();
    if let Some(entry) = config::registry_entry(&provider)
        && entry.env_only
    {
        return Err(AppErrorResponse::validation(
            "mapbox_env_only",
            StatusCode::BAD_REQUEST,
        ));
    }
    let value = body.value.as_deref().unwrap_or("").trim();
    if value.is_empty() {
        return Err(AppErrorResponse::validation(
            "value_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    if !state.tokens.ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let user_id = ctx.user_id().as_str().to_string();
    let email = ctx.user_id().as_str().to_string();
    let row = state
        .tokens
        .upsert_user_token(&user_id, &email, &provider, value)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "token": {
            "provider": row.provider,
            "configured": row.configured,
            "active": row.active,
            "masked": row.masked,
        },
    })))
}

pub async fn delete_api_token(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(provider): Path<String>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    if !state.tokens.ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let user_id = ctx.user_id().as_str().to_string();
    let provider = provider.trim().to_lowercase();
    let deleted = state.tokens.delete_user_token(&user_id, &provider).await?;
    Ok(Json(json!({ "ok": true, "deleted": deleted })))
}
