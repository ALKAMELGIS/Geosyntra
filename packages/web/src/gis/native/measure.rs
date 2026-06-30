//! Geodesic measure helpers (Task 31.11 / 31.12).

/// Haversine distance in kilometres between WGS84 points.
pub fn haversine_km(lng0: f64, lat0: f64, lng1: f64, lat1: f64) -> f64 {
    let r = 6371.0_f64;
    let d_lat = (lat1 - lat0).to_radians();
    let d_lng = (lng1 - lng0).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat0.to_radians().cos() * lat1.to_radians().cos() * (d_lng / 2.0).sin().powi(2);
    2.0 * r * a.sqrt().asin()
}

/// Total path length for a line ring [[lng, lat], ...].
pub fn line_length_km(coords: &[(f64, f64)]) -> f64 {
    if coords.len() < 2 {
        return 0.0;
    }
    coords
        .windows(2)
        .map(|w| haversine_km(w[0].0, w[0].1, w[1].0, w[1].1))
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn haversine_positive() {
        assert!(haversine_km(0.0, 0.0, 0.1, 0.0) > 0.0);
    }
}
