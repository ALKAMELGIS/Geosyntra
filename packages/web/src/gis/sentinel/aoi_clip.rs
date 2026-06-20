//! AOI polygon → EPSG:3857 WKT for Sentinel Hub GEOMETRY param.

use serde_json::Value;

const MAX_RING_VERTICES: usize = 72;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AoiClipResult {
    pub geometry_wkt_3857: Option<String>,
    pub evalscript_b64: Option<String>,
}

pub fn clip_from_geojson(geojson: &Value) -> Option<AoiClipResult> {
    let ring = extract_outer_ring_wgs84(geojson)?;
    if ring.len() < 3 {
        return None;
    }
    let wkt = polygon_wkt_3857(&ring);
    Some(AoiClipResult {
        geometry_wkt_3857: Some(wkt),
        evalscript_b64: None,
    })
}

fn extract_outer_ring_wgs84(geojson: &Value) -> Option<Vec<(f64, f64)>> {
    if geojson.get("type").and_then(|v| v.as_str()) == Some("Feature") {
        return extract_outer_ring_wgs84(geojson.get("geometry")?);
    }
    let geometry = geojson;
    let coords = geometry.get("coordinates")?;
    match geometry.get("type").and_then(|v| v.as_str())? {
        "Polygon" => parse_polygon_ring(coords),
        "MultiPolygon" => coords
            .get(0)?
            .get(0)
            .and_then(|ring| parse_ring_coords(ring)),
        _ => None,
    }
}

fn parse_polygon_ring(coords: &Value) -> Option<Vec<(f64, f64)>> {
    parse_ring_coords(coords.get(0)?)
}

fn parse_ring_coords(ring: &Value) -> Option<Vec<(f64, f64)>> {
    let arr = ring.as_array()?;
    let mut pts: Vec<(f64, f64)> = arr
        .iter()
        .filter_map(|pt| {
            let a = pt.as_array()?;
            let lng = a.first()?.as_f64()?;
            let lat = a.get(1)?.as_f64()?;
            Some((lng, lat))
        })
        .collect();
    if pts.len() > MAX_RING_VERTICES {
        let step = (pts.len() as f64 / MAX_RING_VERTICES as f64).ceil() as usize;
        pts = pts.into_iter().step_by(step.max(1)).collect();
    }
    Some(pts)
}

fn lng_lat_to_web_mercator(lng: f64, lat: f64) -> (f64, f64) {
    let x = lng * 20037508.34 / 180.0;
    let lat_rad = lat.to_radians();
    let y = ((lat_rad.tan() + 1.0 / lat_rad.cos()).ln()) / std::f64::consts::PI * 20037508.34;
    (x, y)
}

fn polygon_wkt_3857(ring_wgs84: &[(f64, f64)]) -> String {
    let mut coords: Vec<String> = ring_wgs84
        .iter()
        .map(|(lng, lat)| {
            let (x, y) = lng_lat_to_web_mercator(*lng, *lat);
            format!("{x} {y}")
        })
        .collect();
    if let Some(first) = coords.first().cloned() {
        if coords.last() != Some(&first) {
            coords.push(first);
        }
    }
    format!("POLYGON(({}))", coords.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_wkt_from_polygon_feature() {
        let geo = json!({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[53.0, 22.0], [54.0, 22.0], [54.0, 23.0], [53.0, 22.0]]]
            }
        });
        let clip = clip_from_geojson(&geo).expect("clip");
        assert!(clip
            .geometry_wkt_3857
            .as_deref()
            .unwrap_or("")
            .starts_with("POLYGON(("));
    }
}
