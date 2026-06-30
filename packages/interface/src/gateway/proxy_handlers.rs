use axum::{
    extract::{Path, RawQuery, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

fn normalize_path_suffix(path: &str) -> Result<String, AppErrorResponse> {
    let suffix = path.trim_start_matches('/').trim();
    if suffix.is_empty() {
        return Err(AppErrorResponse::validation(
            "path_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Ok(suffix.to_string())
}

fn merge_query_param(raw_query: Option<String>, key: &str, value: &str) -> String {
    let mut pairs: Vec<(String, String)> = raw_query
        .unwrap_or_default()
        .split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((k.to_string(), v.to_string()))
        })
        .collect();
    pairs.retain(|(k, _)| k != key);
    pairs.push((key.to_string(), value.to_string()));
    pairs
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&")
}

async fn proxy_get_upstream_json(
    upstream_url: &str,
) -> Result<Response, AppErrorResponse> {
    let client = reqwest::Client::new();
    let upstream = client
        .get(upstream_url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| {
            AppErrorResponse::validation(
                &format!("upstream_proxy_failed: {e}"),
                StatusCode::BAD_GATEWAY,
            )
        })?;
    let status = upstream.status();
    let data: Value = upstream.json().await.unwrap_or(json!({}));
    Ok((status, Json(data)).into_response())
}

/// OpenRouteService authenticated proxy — mirrors Express `POST /api/gateway/openrouteservice/*`.
pub async fn openrouteservice_proxy(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(path): Path<String>,
    Json(body): Json<Value>,
) -> Result<Response, AppErrorResponse> {
    if !state.tokens.is_configured("openrouteservice").await? {
        return Err(AppErrorResponse::validation(
            "ors_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let api_key = state
        .tokens
        .resolve("openrouteservice")
        .await?
        .ok_or_else(|| {
            AppErrorResponse::validation(
                "ors_not_configured",
                StatusCode::SERVICE_UNAVAILABLE,
            )
        })?;
    let path_suffix = normalize_path_suffix(&path)?;
    let upstream_url = format!("https://api.openrouteservice.org/{path_suffix}");
    let client = reqwest::Client::new();
    let upstream = client
        .post(&upstream_url)
        .header(reqwest::header::AUTHORIZATION, api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json, application/geo+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            AppErrorResponse::validation(
                &format!("ors_proxy_failed: {e}"),
                StatusCode::BAD_GATEWAY,
            )
        })?;
    let status = upstream.status();
    let data: Value = upstream.json().await.unwrap_or(json!({}));
    Ok((status, Json(data)).into_response())
}

/// GraphHopper authenticated GET proxy — mirrors Express `GET /api/gateway/graphhopper/*`.
pub async fn graphhopper_proxy(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(path): Path<String>,
    RawQuery(raw_query): RawQuery,
) -> Result<Response, AppErrorResponse> {
    if !state.tokens.is_configured("graphhopper").await? {
        return Err(AppErrorResponse::validation(
            "graphhopper_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let api_key = state
        .tokens
        .resolve("graphhopper")
        .await?
        .ok_or_else(|| {
            AppErrorResponse::validation(
                "graphhopper_not_configured",
                StatusCode::SERVICE_UNAVAILABLE,
            )
        })?;
    let path_suffix = normalize_path_suffix(&path)?;
    let qs = merge_query_param(raw_query, "key", &api_key);
    let upstream_url = format!("https://graphhopper.com/api/1/{path_suffix}?{qs}");
    proxy_get_upstream_json(&upstream_url).await
}

/// OpenWeatherMap authenticated GET proxy — mirrors Express `GET /api/gateway/openweathermap/*`.
pub async fn openweathermap_proxy(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(path): Path<String>,
    RawQuery(raw_query): RawQuery,
) -> Result<Response, AppErrorResponse> {
    if !state.tokens.is_configured("openweathermap").await? {
        return Err(AppErrorResponse::validation(
            "openweathermap_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let api_key = state
        .tokens
        .resolve("openweathermap")
        .await?
        .ok_or_else(|| {
            AppErrorResponse::validation(
                "openweathermap_not_configured",
                StatusCode::SERVICE_UNAVAILABLE,
            )
        })?;
    let path_suffix = normalize_path_suffix(&path)?;
    let qs = merge_query_param(raw_query, "appid", &api_key);
    let upstream_url = format!("https://api.openweathermap.org/{path_suffix}?{qs}");
    proxy_get_upstream_json(&upstream_url).await
}
