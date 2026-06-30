//! OpenRouteService routing client — Axum gateway (Task 32.FD-6).

use serde::Deserialize;

use crate::{api_client::ApiClient, error_display::ApiError};

use super::graphhopper::{RouteSession, RouteWaypoint};

#[derive(Debug, Deserialize)]
struct OrsRouteResponse {
    #[serde(default)]
    routes: Vec<OrsRoute>,
}

#[derive(Debug, Deserialize)]
struct OrsRoute {
    #[serde(default)]
    summary: Option<OrsSummary>,
    #[serde(default)]
    geometry: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OrsSummary {
    #[serde(default)]
    distance: Option<f64>,
    #[serde(default)]
    duration: Option<f64>,
}

pub async fn fetch_route_ors(
    waypoints: &[RouteWaypoint],
    profile: &str,
    token: &str,
) -> Result<RouteSession, ApiError> {
    if waypoints.len() < 2 {
        return Err(ApiError::Http {
            status: 400,
            message: "at least two waypoints required".into(),
        });
    }
    let client = ApiClient::from_env();
    let coords: Vec<[f64; 2]> = waypoints.iter().map(|w| [w.lng, w.lat]).collect();
    let body = serde_json::json!({
        "coordinates": coords,
        "profile": profile,
    });
    let path = "/api/gateway/openrouteservice/v2/directions/driving-car/geojson";
    let resp: OrsRouteResponse = client.post_json(path, &body, Some(token)).await?;
    let route = resp.routes.into_iter().next().ok_or_else(|| ApiError::Parse {
        message: "ors returned no routes".into(),
    })?;
    let summary = route.summary.unwrap_or(OrsSummary {
        distance: None,
        duration: None,
    });
    Ok(RouteSession {
        distance_m: summary.distance.unwrap_or(0.0),
        time_ms: summary.duration.map(|d| (d * 1000.0) as u64).unwrap_or(0),
        coordinates: waypoints.iter().map(|w| [w.lng, w.lat]).collect(),
        profile: profile.into(),
        provider: "openrouteservice".into(),
    })
}
