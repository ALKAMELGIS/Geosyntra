//! GraphHopper routing client — React `graphHopperRouting.ts` (Task 32.7).

use serde::{Deserialize, Serialize};

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
}

pub fn demo_route_session(waypoints: &[RouteWaypoint], profile: &str) -> Option<RouteSession> {
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
        profile: profile.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_route_has_distance() {
        let wp = vec![
            RouteWaypoint { lng: 0.0, lat: 0.0 },
            RouteWaypoint { lng: 0.1, lat: 0.0 },
        ];
        let s = demo_route_session(&wp, "car").expect("route");
        assert!(s.distance_m > 0.0);
    }
}
