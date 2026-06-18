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
    user_tokens::is_platform_owner,
};

fn token_store_ready() -> bool {
    false
}

fn registry_status_rows() -> Vec<Value> {
    config::TOKEN_REGISTRY
        .iter()
        .map(|entry| {
            let configured = if entry.env_only {
                entry.env_keys.iter().any(|k| env_config::env_non_empty(k))
            } else {
                config::token_configured(entry.name)
            };
            json!({
                "name": entry.name,
                "label": entry.label,
                "category": entry.category,
                "configured": configured,
                "active": configured,
                "envOnly": entry.env_only,
                "source": if configured { "environment" } else { "none" },
            })
        })
        .collect()
}

pub async fn tokens_status(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    Ok(Json(json!({
        "ok": true,
        "tokens": registry_status_rows(),
        "storeReady": token_store_ready(),
        "encrypted": env_config::env_non_empty("API_VAULT_MASTER_KEY"),
    })))
}

pub async fn list_tokens(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    if !token_store_ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Ok(Json(json!({
        "ok": true,
        "tokens": [],
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
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(name): Path<String>,
    Json(body): Json<UpsertTokenRequest>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    let name = name.trim().to_lowercase();
    let Some(entry) = config::registry_entry(&name) else {
        return Err(AppErrorResponse::validation("unknown_token", StatusCode::NOT_FOUND));
    };
    if entry.env_only {
        return Err(AppErrorResponse::validation(
            "mapbox_env_only",
            StatusCode::BAD_REQUEST,
        ));
    }
    if !token_store_ready() {
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
    let _ = (body.label, body.category, body.active, body.expires_at);
    Ok(Json(json!({ "ok": true, "token": { "name": name }, "revision": 0 })))
}

pub async fn patch_token(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(name): Path<String>,
    Json(body): Json<UpsertTokenRequest>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    let name = name.trim().to_lowercase();
    let Some(entry) = config::registry_entry(&name) else {
        return Err(AppErrorResponse::validation("unknown_token", StatusCode::NOT_FOUND));
    };
    if entry.env_only {
        return Err(AppErrorResponse::validation(
            "mapbox_env_only",
            StatusCode::BAD_REQUEST,
        ));
    }
    if !token_store_ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    if let Some(value) = body.value.as_deref()
        && value.trim().is_empty()
    {
        return Err(AppErrorResponse::validation(
            "value_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Ok(Json(json!({ "ok": true, "token": { "name": name }, "revision": 0 })))
}

pub async fn test_token(
    State(_state): State<AppState>,
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
    let configured = config::token_configured(&name);
    Ok(Json(json!({
        "ok": configured,
        "message": if configured { "configured_via_environment" } else { "not_configured" },
    })))
}

pub async fn migrate_from_vault(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    if !token_store_ready() {
        return Err(AppErrorResponse::validation(
            "token_store_unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let _ = ctx;
    Ok(Json(json!({
        "ok": true,
        "migrated": 0,
        "skipped": 0,
        "revision": 0,
    })))
}
