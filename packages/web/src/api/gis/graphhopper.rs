//! GraphHopper routing client — Axum gateway `/api/gateway/graphhopper/*` (Task 32.7).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteWaypoint {
    pub lng: f64,
    pub lat: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteSession {
    pub distance_m: f64,
    pub time_ms: u64,
    pub coordinates: Vec<[f64; 2]>,
    pub profile: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
struct GhPath {
    #[serde(default)]
    distance: Option<f64>,
    #[serde(default)]
    time: Option<f64>,
    #[serde(default)]
    points: Option<GhPoints>,
}

#[derive(Debug, Deserialize)]
struct GhPoints {
    #[serde(default)]
    coordinates: Option<Vec<Vec<f64>>>,
}

#[derive(Debug, Deserialize)]
struct GhRouteResponse {
    #[serde(default)]
    paths: Vec<GhPath>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    hint: Option<String>,
}

fn haversine_fallback(waypoints: &[RouteWaypoint]) -> Option<RouteSession> {
    if waypoints.len() < 2 {
        return None;
    }
    let mut total = 0.0;
    for w in waypoints.windows(2) {
        total += crate::gis::native::haversine_km(w[0].lng, w[0].lat, w[1].lng, w[1].lat) * 1000.0;
    }
    let coordinates: Vec<[f64; 2]> = waypoints.iter().map(|w| [w.lng, w.lat]).collect();
    Some(RouteSession {
        distance_m: total,
        time_ms: (total / 12.0 * 1000.0) as u64,
        coordinates,
        profile: "car".into(),
        provider: "haversine-fallback".into(),
    })
}

fn parse_gh_response(body: GhRouteResponse, profile: &str) -> Result<RouteSession, ApiError> {
    let path = body.paths.into_iter().next().ok_or_else(|| ApiError::Parse {
        message: body
            .message
            .or(body.hint)
            .unwrap_or_else(|| "graphhopper returned no paths".into()),
    })?;
    let coords = path
        .points
        .and_then(|p| p.coordinates)
        .map(|c| {
            c.into_iter()
                .filter_map(|pair| {
                    if pair.len() >= 2 {
                        Some([pair[0], pair[1]])
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(RouteSession {
        distance_m: path.distance.unwrap_or(0.0),
        time_ms: path.time.unwrap_or(0.0) as u64,
        coordinates: coords,
        profile: profile.into(),
        provider: "graphhopper".into(),
    })
}

/// Compute route via Axum GraphHopper gateway; falls back to straight-line when gateway unavailable.
pub async fn fetch_route(
    waypoints: &[RouteWaypoint],
    profile: &str,
    token: Option<&str>,
) -> Result<RouteSession, ApiError> {
    if waypoints.len() < 2 {
        return Err(ApiError::Http {
            status: 400,
            message: "at least two waypoints required".into(),
        });
    }
    if let Some(tok) = token {
        if let Ok(session) = fetch_route_via_gateway(waypoints, profile, tok).await {
            return Ok(session);
        }
    }
    haversine_fallback(waypoints).ok_or_else(|| ApiError::Http {
        status: 503,
        message: "routing unavailable — configure GraphHopper on the platform".into(),
    })
}

pub async fn fetch_route_via_gateway(
    waypoints: &[RouteWaypoint],
    profile: &str,
    token: &str,
) -> Result<RouteSession, ApiError> {
    let client = ApiClient::from_env();
    let mut qs = format!(
        "profile={profile}&locale=en&points_encoded=false&calc_points=true&instructions=false"
    );
    for wp in waypoints {
        qs.push_str(&format!("&point={},{}", wp.lat, wp.lng));
    }
    let path = format!("/api/gateway/graphhopper/route?{qs}");
    let body: GhRouteResponse = client.get_json(&path, Some(token)).await?;
    parse_gh_response(body, profile)
}

/// Straight-line demo route — use `fetch_route` in production paths.
pub fn demo_route_session(waypoints: &[RouteWaypoint], profile: &str) -> Option<RouteSession> {
    haversine_fallback(waypoints).map(|mut s| {
        s.profile = profile.into();
        s
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_route_has_distance() {
        let wp = vec![
            RouteWaypoint { lng: 0.0, lat: 0.0 },
            RouteWaypoint { lng: 0.1, lat: 0.0 },
        ];
        let s = demo_route_session(&wp, "car").expect("route");
        assert!(s.distance_m > 0.0);
    }
}
