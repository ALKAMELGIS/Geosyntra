//! Geo stats helpers for AOI charts (Task 31.9).

use serde_json::Value;

/// Approximate geodesic area in km² for a GeoJSON polygon (WGS84).
pub fn polygon_area_km2(geojson: &Value) -> Option<f64> {
    let ring = extract_outer_ring(geojson)?;
    if ring.len() < 4 {
        return None;
    }
    let mut area = 0.0_f64;
    for i in 0..ring.len() - 1 {
        let (lng0, lat0) = ring[i];
        let (lng1, lat1) = ring[i + 1];
        area += lng0.to_radians() * lat1.to_radians() - lng1.to_radians() * lat0.to_radians();
    }
    area = area.abs() / 2.0;
    let avg_lat = ring.iter().map(|(_, lat)| lat.to_radians()).sum::<f64>() / ring.len() as f64;
    Some(area * (111.32 * 111.32) * avg_lat.cos().abs().max(0.01))
}

fn extract_outer_ring(geojson: &Value) -> Option<Vec<(f64, f64)>> {
    let geom = if geojson.get("type").and_then(|t| t.as_str()) == Some("Feature") {
        geojson.get("geometry")?
    } else {
        geojson
    };
    if geom.get("type")?.as_str()? != "Polygon" {
        return None;
    }
    let ring = geom.get("coordinates")?.get(0)?.as_array()?;
    let mut out = Vec::new();
    for pt in ring {
        let arr = pt.as_array()?;
        out.push((arr.first()?.as_f64()?, arr.get(1)?.as_f64()?));
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn computes_positive_area_for_square() {
        let square = json!({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [0.0, 0.0], [0.01, 0.0], [0.01, 0.01], [0.0, 0.01], [0.0, 0.0]
                ]]
            }
        });
        assert!(polygon_area_km2(&square).unwrap() > 0.0);
    }
}
