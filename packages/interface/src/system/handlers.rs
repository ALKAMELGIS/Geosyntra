use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    config,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
    user_tokens::is_platform_owner,
};

fn status_to_json(row: &application::ports::SystemTokenStatus) -> Value {
    json!({
        "name": row.name,
        "label": row.label,
        "category": row.category,
        "configured": row.configured,
        "active": row.active,
        "masked": row.masked,
        "envOnly": row.env_only,
        "source": row.source,
        "expiresAt": row.expires_at,
        "lastTestedAt": row.last_tested_at,
        "lastTestOk": row.last_test_ok,
        "lastTestMessage": row.last_test_message,
        "updatedAt": row.updated_at,
        "updatedBy": row.updated_by,
        "encrypted": row.encrypted,
    })
}

async fn registry_status_rows(state: &AppState) -> Result<Vec<Value>, AppErrorResponse> {
    let rows = state.tokens.list_system_status().await?;
    Ok(rows.iter().map(status_to_json).collect())
}

pub async fn tokens_status(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    let tokens = registry_status_rows(&state).await?;
    Ok(Json(json!({
        "ok": true,
        "tokens": tokens,
        "storeReady": state.tokens.ready(),
        "encrypted": state.tokens.encrypted_at_rest(),
    })))
}

pub async fn list_tokens(
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
    let tokens = registry_status_rows(&state).await?;
    Ok(Json(json!({
        "ok": true,
        "tokens": tokens,
        "storeReady": true,
    })))
}

#[derive(Debug, Deserialize)]
pub struct UpsertTokenRequest {
    pub value: Option<String>,
    pub label: Option<String>,
    pub category: Option<String>,
    pub active: Option<bool>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<String>,
}

pub async fn upsert_token(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(name): Path<String>,
    Json(body): Json<UpsertTokenRequest>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    let name = name.trim().to_lowercase();
    if config::registry_entry(&name).is_none() {
        return Err(AppErrorResponse::validation("unknown_token", StatusCode::NOT_FOUND));
    }
    if !state.tokens.ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let value = body.value.as_deref().unwrap_or("").trim();
    if value.is_empty() {
        return Err(AppErrorResponse::validation(
            "value_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    let updated_by = Some(ctx.user_id().as_str().to_string());
    let row = state
        .tokens
        .upsert_system(
            &name,
            value,
            body.label.as_deref(),
            body.category.as_deref(),
            body.active.unwrap_or(true),
            updated_by.as_deref(),
        )
        .await?;
    let _ = body.expires_at;
    Ok(Json(json!({ "ok": true, "token": status_to_json(&row), "revision": 1 })))
}

pub async fn patch_token(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(name): Path<String>,
    Json(body): Json<UpsertTokenRequest>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    let name = name.trim().to_lowercase();
    if config::registry_entry(&name).is_none() {
        return Err(AppErrorResponse::validation("unknown_token", StatusCode::NOT_FOUND));
    }
    if !state.tokens.ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let updated_by = Some(ctx.user_id().as_str().to_string());
    let row = state
        .tokens
        .patch_system(
            &name,
            body.value.as_deref(),
            body.active,
            updated_by.as_deref(),
        )
        .await?;
    Ok(Json(json!({ "ok": true, "token": status_to_json(&row), "revision": 1 })))
}

pub async fn test_token(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(name): Path<String>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    let name = name.trim().to_lowercase();
    if config::registry_entry(&name).is_none() {
        return Err(AppErrorResponse::validation("unknown_token", StatusCode::NOT_FOUND));
    }
    let configured = state.tokens.is_configured(&name).await?;
    let message = if configured {
        "configured"
    } else {
        "not_configured"
    };
    if configured {
        state
            .tokens
            .record_system_test(&name, true, Some(message))
            .await?;
    }
    Ok(Json(json!({
        "ok": configured,
        "message": message,
    })))
}

pub async fn migrate_from_vault(
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
    let synced = state.tokens.sync_environment().await?;
    Ok(Json(json!({
        "ok": true,
        "migrated": synced,
        "skipped": 0,
        "revision": synced,
    })))
}
