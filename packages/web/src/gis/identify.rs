//! Map feature identify — React `runSatelliteMapIdentify.ts` subset (Task 32.9).

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IdentifyHit {
    pub layer_id: String,
    pub layer_name: String,
    pub properties: Value,
    pub geometry_type: String,
}

pub fn identify_at_point(
    lng: f64,
    lat: f64,
    layers: &[(String, String, &Value)],
) -> Vec<IdentifyHit> {
    let mut hits = Vec::new();
    for (layer_id, layer_name, geojson) in layers {
        if point_in_geojson(lng, lat, geojson) {
            hits.push(IdentifyHit {
                layer_id: layer_id.clone(),
                layer_name: layer_name.clone(),
                properties: geojson
                    .get("properties")
                    .cloned()
                    .unwrap_or(Value::Null),
                geometry_type: geojson
                    .pointer("/geometry/type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .into(),
            });
        }
    }
    hits
}

fn point_in_geojson(lng: f64, lat: f64, geojson: &Value) -> bool {
    if let Some(bounds) = crate::gis::aoi_bounds(geojson) {
        let [w, s, e, n] = bounds;
        return lng >= w && lng <= e && lat >= s && lat <= n;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn hits_feature_in_bounds() {
        let geo = json!({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[53.0, 22.0], [54.0, 22.0], [54.0, 23.0], [53.0, 22.0]]]
            },
            "properties": { "name": "Test" }
        });
        let hits = identify_at_point(53.5, 22.5, &[("lyr".into(), "Layer".into(), &geo)]);
        assert_eq!(hits.len(), 1);
    }
}
