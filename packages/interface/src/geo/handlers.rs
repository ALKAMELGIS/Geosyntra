use axum::{
    extract::Query,
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::{config, env_config, error::AppErrorResponse};

const GROUNDING_TOOLS: &[&str] = &["geocode", "places_text_search", "compute_route", "elevation"];

fn google_maps_configured() -> bool {
    ["GOOGLE_MAPS_SERVER_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY"]
        .iter()
        .any(|k| env_config::env_non_empty(k))
}

/// Public grounding provider status — mirrors Express `GET /api/geo/grounding/status`.
pub async fn grounding_status() -> Json<serde_json::Value> {
    let google = google_maps_configured();
    let ors = config::token_configured("openrouteservice");
    let gh = config::token_configured("graphhopper");
    Json(json!({
        "ok": true,
        "configured": google || ors || gh,
        "tools": GROUNDING_TOOLS,
        "providers": {
            "google_maps_platform": google,
            "openrouteservice": ors,
            "graphhopper": gh,
        },
    }))
}

/// Grounding invoke stub — validates tool id; live Google/ORS calls deferred.
pub async fn grounding_invoke(
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, crate::error::AppErrorResponse> {
    use axum::http::StatusCode;

    let tool = body
        .get("tool")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if tool.is_empty() || !GROUNDING_TOOLS.contains(&tool) {
        return Err(crate::error::AppErrorResponse::validation(
            "unknown_tool",
            StatusCode::BAD_REQUEST,
        ));
    }

    let google = google_maps_configured();
    let ors = config::token_configured("openrouteservice");
    let gh = config::token_configured("graphhopper");
    if !google && !ors && !gh && tool != "compute_route" {
        return Err(crate::error::AppErrorResponse::validation(
            "geo_grounding_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }

    Err(crate::error::AppErrorResponse::validation(
        "grounding_invoke_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

#[derive(Debug, Deserialize)]
pub struct GeoLocationsQuery {
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
}

fn clamp_limit(limit: u32) -> u32 {
    limit.clamp(1, 100)
}

/// In-memory geo locations list — Postgres persistence deferred.
pub async fn list_locations(Query(query): Query<GeoLocationsQuery>) -> Json<serde_json::Value> {
    let limit = clamp_limit(query.limit.unwrap_or(20));
    let offset = query.offset.unwrap_or(0);
    Json(json!({
        "total": 0,
        "limit": limit,
        "offset": offset,
        "items": [],
    }))
}

/// Create geo location — validation stub until persistence lands.
pub async fn create_location(
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let site = body
        .get("site")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if site.is_empty() {
        return Err(AppErrorResponse::validation(
            "site_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "geo_location_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}
