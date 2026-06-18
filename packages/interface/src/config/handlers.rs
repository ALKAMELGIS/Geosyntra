use axum::{extract::State, http::HeaderValue, response::IntoResponse, Json};
use serde_json::json;

use crate::{
    config::tokens::{self, mapbox_public_token},
    env_config,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

fn mapbox_response() -> Json<serde_json::Value> {
    let server_token = ["MAPBOX_TOKEN", "MAPBOX", "MAPBOX_ACCESS_TOKEN"]
        .iter()
        .any(|k| env_config::env_non_empty(k));
    let public_token = mapbox_public_token();
    let configured = server_token || public_token.is_some();

    if !configured {
        return Json(json!({
            "ok": true,
            "configured": false,
            "publicToken": null,
            "error": "MAPBOX_TOKEN missing from backend environment",
            "publicOnly": false,
            "proxyMode": false,
            "source": "environment",
            "gatewayPath": "/api/mapbox-proxy",
            "geocodingPath": "/api/gateway/mapbox/geocoding",
        }));
    }

    Json(json!({
        "ok": true,
        "configured": true,
        "publicToken": public_token,
        "publicOnly": public_token.is_some(),
        "proxyMode": true,
        "source": "environment",
        "gatewayPath": "/api/mapbox-proxy",
        "geocodingPath": "/api/gateway/mapbox/geocoding",
    }))
}

/// Public Mapbox config — mirrors Express `GET /api/config/mapbox`.
pub async fn mapbox_config() -> impl IntoResponse {
    let mut resp = mapbox_response().into_response();
    resp.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

pub async fn config_status(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let capabilities = state.tokens.capabilities_snapshot().await?;
    Ok(Json(json!({
        "ok": true,
        "revision": 1,
        "capabilities": capabilities,
        "environment": tokens::audit_environment_bindings(),
        "gatewayMode": true,
    })))
}

pub async fn gateway_status(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let capabilities = state.tokens.capabilities_snapshot().await?;
    Ok(Json(json!({
        "ok": true,
        "revision": 0,
        "capabilities": capabilities,
        "gateway": {
            "gemini": capabilities.get("gemini").and_then(|v| v.as_bool()).unwrap_or(false),
            "openai": capabilities.get("openai").and_then(|v| v.as_bool()).unwrap_or(false),
            "claude": capabilities.get("claude").and_then(|v| v.as_bool()).unwrap_or(false),
            "deepseek": capabilities.get("deepseek").and_then(|v| v.as_bool()).unwrap_or(false),
            "mapbox": capabilities.get("mapbox").and_then(|v| v.as_bool()).unwrap_or(false),
            "arcgis": capabilities.get("arcgis").and_then(|v| v.as_bool()).unwrap_or(false),
            "sentinelhub": capabilities.get("sentinelhub").and_then(|v| v.as_bool()).unwrap_or(false),
            "openrouteservice": capabilities.get("openrouteservice").and_then(|v| v.as_bool()).unwrap_or(false),
            "graphhopper": capabilities.get("graphhopper").and_then(|v| v.as_bool()).unwrap_or(false),
            "openweathermap": capabilities.get("openweathermap").and_then(|v| v.as_bool()).unwrap_or(false),
        },
        "encrypted": env_config::env_non_empty("API_VAULT_MASTER_KEY"),
    })))
}

pub async fn provider_config(
    gateway_path: &'static str,
    token_name: &'static str,
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    Ok(Json(json!({
        "ok": true,
        "configured": state.tokens.is_configured(token_name).await?,
        "gatewayPath": gateway_path,
    })))
}

pub async fn gemini_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config(
        "/api/gateway/gemini/generate-content",
        "gemini",
        state,
        ctx,
        env,
    )
    .await
}

pub async fn openai_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config("/api/gateway/openai/chat", "openai", state, ctx, env).await
}

pub async fn claude_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config("/api/gateway/claude/messages", "claude", state, ctx, env).await
}

pub async fn deepseek_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config("/api/gateway/deepseek/chat", "deepseek", state, ctx, env).await
}

pub async fn graphhopper_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config("/api/gateway/graphhopper", "graphhopper", state, ctx, env).await
}

pub async fn openrouteservice_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config(
        "/api/gateway/openrouteservice",
        "openrouteservice",
        state,
        ctx,
        env,
    )
    .await
}

pub async fn openweathermap_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    provider_config(
        "/api/gateway/openweathermap",
        "openweathermap",
        state,
        ctx,
        env,
    )
    .await
}

pub async fn sentinel_config(
    state: State<AppState>,
    ctx: AuthSubject,
    env: RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let configured = state.tokens.is_configured("sentinelhub").await?
        || state.tokens.is_configured("sentinelhub_wms").await?;
    if !configured {
        return Ok(Json(json!({
            "ok": true,
            "configured": false,
            "gatewayPath": "/api/gateway/sentinel/credentials",
        })));
    }
    provider_config(
        "/api/gateway/sentinel/credentials",
        "sentinelhub",
        state,
        ctx,
        env,
    )
    .await
}
