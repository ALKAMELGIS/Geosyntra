use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    config::{mapbox_public_token, token_configured},
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

fn mapbox_available() -> bool {
    token_configured("mapbox") || mapbox_public_token().is_some()
}

/// Authenticated Mapbox public token — mirrors Express `GET /api/gateway/mapbox/public-token`.
pub async fn mapbox_public_token_route(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    if !mapbox_available() {
        return Err(AppErrorResponse::validation(
            "mapbox_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    if let Some(token) = mapbox_public_token() {
        return Ok(Json(json!({
            "ok": true,
            "configured": true,
            "token": token,
            "proxyMode": false,
            "publicOnly": true,
        })));
    }
    Ok(Json(json!({
        "ok": true,
        "configured": true,
        "token": null,
        "proxyMode": true,
        "publicOnly": false,
    })))
}

async fn mapbox_proxy_stub() -> Result<Json<Value>, AppErrorResponse> {
    if !mapbox_available() {
        return Err(AppErrorResponse::validation(
            "mapbox_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Err(AppErrorResponse::validation(
        "mapbox_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

/// Public Mapbox tile/style proxy — mirrors Express `GET /api/mapbox-proxy`.
pub async fn mapbox_proxy() -> Result<Json<Value>, AppErrorResponse> {
    mapbox_proxy_stub().await
}

/// Alias for `/api/mapbox-proxy`.
pub async fn mapbox_gateway_proxy() -> Result<Json<Value>, AppErrorResponse> {
    mapbox_proxy_stub().await
}

#[derive(Debug, Deserialize)]
pub struct MapboxGeocodingQuery {
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
}

/// Public Mapbox geocoding proxy — validates query; upstream fetch deferred.
pub async fn mapbox_geocoding(
    Query(params): Query<MapboxGeocodingQuery>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !mapbox_available() {
        return Err(AppErrorResponse::validation(
            "mapbox_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let q = params
        .q
        .or(params.query)
        .unwrap_or_default()
        .trim()
        .to_string();
    if q.is_empty() {
        return Err(AppErrorResponse::validation(
            "query_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "mapbox_geocoding_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

fn first_env_token(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| crate::env_config::trim_env_public(k))
}

fn google_maps_configured() -> bool {
    ["GOOGLE_MAPS_SERVER_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY"]
        .iter()
        .any(|k| crate::env_config::env_non_empty(k))
}

async fn google_3d_tiles_stub() -> Result<Json<Value>, AppErrorResponse> {
    if !google_maps_configured() {
        return Err(AppErrorResponse::validation(
            "google_maps_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Err(AppErrorResponse::validation(
        "google_3d_tiles_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

/// Sentinel Hub credentials for authenticated clients — env-only until vault lands.
pub async fn sentinel_credentials(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    let access_token = first_env_token(&[
        "SENTINEL_HUB_ACCESS_TOKEN",
        "SENTINEL_HUB_TOKEN",
        "SENTINEL",
    ]);
    let wms_instance_id = first_env_token(&["SENTINEL_HUB_WMS_INSTANCE_ID"]);
    if access_token.is_none() && wms_instance_id.is_none() {
        return Err(AppErrorResponse::validation(
            "sentinel_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Ok(Json(json!({
        "ok": true,
        "accessToken": access_token,
        "wmsInstanceId": wms_instance_id,
    })))
}

pub async fn google_3d_tiles_proxy() -> Result<Json<Value>, AppErrorResponse> {
    google_3d_tiles_stub().await
}

pub async fn google_3d_tiles_root() -> Result<Json<Value>, AppErrorResponse> {
    google_3d_tiles_stub().await
}
