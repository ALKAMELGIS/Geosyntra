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

/// Session token hydration — env-based capabilities until user token vault lands.
pub async fn api_tokens_session(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    let owner = is_platform_owner(&ctx);
    let allow_hydration = env_config::trim_env_public("GEOSYNTRA_ALLOW_CLIENT_SECRET_HYDRATION")
        .as_deref()
        == Some("true");
    Ok(Json(json!({
        "ok": true,
        "revision": 0,
        "persisted": false,
        "capabilities": config::build_platform_capabilities(),
        "encrypted": env_config::env_non_empty("API_VAULT_MASTER_KEY"),
        "readOnly": !owner,
        "gatewayMode": !allow_hydration,
    })))
}

pub async fn list_api_tokens(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    Err(AppErrorResponse::validation(
        "token_store_unavailable",
        StatusCode::SERVICE_UNAVAILABLE,
    ))
}

#[derive(Debug, Deserialize)]
pub struct UpsertUserTokenRequest {
    pub value: Option<String>,
}

pub async fn upsert_api_token(
    State(_state): State<AppState>,
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
    Err(AppErrorResponse::validation(
        "token_store_unavailable",
        StatusCode::SERVICE_UNAVAILABLE,
    ))
}

pub async fn delete_api_token(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(_provider): Path<String>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !is_platform_owner(&ctx) {
        return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
    }
    Err(AppErrorResponse::validation(
        "token_store_unavailable",
        StatusCode::SERVICE_UNAVAILABLE,
    ))
}
