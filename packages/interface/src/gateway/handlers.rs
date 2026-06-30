use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    config::mapbox_public_token,
    env_config,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct MapboxProxyQuery {
    pub url: Option<String>,
}

fn is_allowed_mapbox_url(raw: &str) -> bool {
    let Ok(parsed) = url::Url::parse(raw) else {
        return false;
    };
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    host == "mapbox.com" || host.ends_with(".mapbox.com")
}

fn mapbox_url_with_token(raw: &str, access_token: &str) -> Option<String> {
    let mut parsed = url::Url::parse(raw).ok()?;
    // Proxy always injects the server token — never forward client/placeholder tokens.
    let other: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(k, _)| k != "access_token")
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    parsed.set_query(None);
    {
        let mut qp = parsed.query_pairs_mut();
        for (k, v) in &other {
            qp.append_pair(k, v);
        }
        qp.append_pair("access_token", access_token);
    }
    Some(parsed.to_string())
}

async fn mapbox_configured(state: &AppState) -> Result<bool, AppErrorResponse> {
    Ok(state.tokens.is_configured("mapbox").await? || mapbox_public_token().is_some())
}

pub async fn mapbox_public_token_route(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    if !mapbox_configured(&state).await? {
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

async fn proxy_mapbox_request(
    state: &AppState,
    target: Option<&str>,
) -> Result<Response, AppErrorResponse> {
    if !mapbox_configured(state).await? {
        return Err(AppErrorResponse::validation(
            "mapbox_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let target = target.unwrap_or("").trim();
    if target.is_empty() {
        return Err(AppErrorResponse::validation(
            "url_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    if !is_allowed_mapbox_url(target) {
        return Err(AppErrorResponse::validation(
            "invalid_mapbox_url",
            StatusCode::BAD_REQUEST,
        ));
    }
    let token = state
        .tokens
        .resolve("mapbox")
        .await?
        .or_else(mapbox_public_token)
        .ok_or_else(|| {
            AppErrorResponse::validation("mapbox_not_configured", StatusCode::SERVICE_UNAVAILABLE)
        })?;
    let upstream_url = mapbox_url_with_token(target, &token).ok_or_else(|| {
        AppErrorResponse::validation("invalid_mapbox_url", StatusCode::BAD_REQUEST)
    })?;
    let referer = env_config::trim_env_public("MAPBOX_DEV_REFERER")
        .or_else(|| env_config::trim_env_public("APP_ORIGIN"))
        .unwrap_or_else(|| "https://www.geosyntra.org".into())
        .trim_end_matches('/')
        .to_string()
        + "/";

    let client = reqwest::Client::new();
    let upstream = client
        .get(&upstream_url)
        .header(header::ACCEPT, "*/*")
        .header(header::REFERER, referer)
        .send()
        .await
        .map_err(|e| {
            AppErrorResponse::validation(
                &format!("mapbox_proxy_failed: {e}"),
                StatusCode::BAD_GATEWAY,
            )
        })?;

    let status = upstream.status();
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let is_immutable = content_type.starts_with("image/")
        || content_type.contains("protobuf")
        || content_type.contains("octet-stream")
        || content_type.contains("font");
    let cache_control = if is_immutable {
        "public, max-age=604800, immutable"
    } else {
        "public, max-age=3600"
    };

    if content_type.contains("application/json") {
        let data: Value = upstream.json().await.unwrap_or(json!({}));
        return Ok((status, Json(data)).into_response());
    }

    let bytes = upstream.bytes().await.map_err(|e| {
        AppErrorResponse::validation(
            &format!("mapbox_proxy_failed: {e}"),
            StatusCode::BAD_GATEWAY,
        )
    })?;
    let mut resp = Response::new(Body::from(bytes));
    *resp.status_mut() = status;
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control),
    );
    resp.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    Ok(resp)
}

pub async fn mapbox_proxy(
    State(state): State<AppState>,
    Query(query): Query<MapboxProxyQuery>,
) -> Result<Response, AppErrorResponse> {
    proxy_mapbox_request(&state, query.url.as_deref()).await
}

pub async fn mapbox_gateway_proxy(
    State(state): State<AppState>,
    Query(query): Query<MapboxProxyQuery>,
) -> Result<Response, AppErrorResponse> {
    proxy_mapbox_request(&state, query.url.as_deref()).await
}

#[derive(Debug, Deserialize)]
pub struct MapboxGeocodingQuery {
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
}

pub async fn mapbox_geocoding(
    State(state): State<AppState>,
    Query(params): Query<MapboxGeocodingQuery>,
) -> Result<Response, AppErrorResponse> {
    if !mapbox_configured(&state).await? {
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
    let encoded = urlencoding::encode(&q);
    let target = format!(
        "https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded}.json?limit=5"
    );
    proxy_mapbox_request(&state, Some(&target)).await
}

fn first_env_token(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| env_config::trim_env_public(k))
}

fn google_maps_configured() -> bool {
    ["GOOGLE_MAPS_SERVER_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY"]
        .iter()
        .any(|k| env_config::env_non_empty(k))
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

pub async fn sentinel_credentials(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<Value>, AppErrorResponse> {
    let access_token = state
        .tokens
        .resolve("sentinelhub")
        .await?
        .or_else(|| {
            first_env_token(&[
                "SENTINEL_HUB_ACCESS_TOKEN",
                "SENTINEL_HUB_TOKEN",
                "SENTINEL",
            ])
        });
    let wms_instance_id = state
        .tokens
        .resolve("sentinelhub_wms")
        .await?
        .or_else(|| first_env_token(&["SENTINEL_HUB_WMS_INSTANCE_ID"]));
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
