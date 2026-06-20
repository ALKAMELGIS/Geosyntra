//! Symbology helpers — React `symbologyHelpers.ts` (Task 32.4c).

use std::collections::HashSet;

use serde_json::Value;

pub fn geojson_fields(geojson: &Value) -> Vec<String> {
    let mut fields = HashSet::new();
    collect_features(geojson, |props| {
        if let Some(obj) = props.as_object() {
            for k in obj.keys() {
                fields.insert(k.clone());
            }
        }
    });
    let mut out: Vec<_> = fields.into_iter().collect();
    out.sort();
    out
}

pub fn numeric_fields(geojson: &Value) -> Vec<String> {
    geojson_fields(geojson)
        .into_iter()
        .filter(|f| field_is_numeric(geojson, f))
        .collect()
}

fn field_is_numeric(geojson: &Value, field: &str) -> bool {
    let mut found = false;
    collect_features(geojson, |props| {
        if let Some(v) = props.get(field) {
            if v.is_number() || v.as_str().and_then(|s| s.parse::<f64>().ok()).is_some() {
                found = true;
            }
        }
    });
    found
}

fn collect_features(geojson: &Value, mut f: impl FnMut(&Value)) {
    match geojson.get("type").and_then(|t| t.as_str()) {
        Some("FeatureCollection") => {
            if let Some(arr) = geojson.get("features").and_then(|v| v.as_array()) {
                for feat in arr {
                    if let Some(props) = feat.get("properties") {
                        f(props);
                    }
                }
            }
        }
        Some("Feature") => {
            if let Some(props) = geojson.get("properties") {
                f(props);
            }
        }
        _ => {}
    }
}

pub fn sample_ramp_stops(stops: &[(f64, &str)], t: f64) -> String {
    if stops.is_empty() {
        return "#38bdf8".into();
    }
    let pairs: Vec<(&str, f64)> = stops.iter().map(|(v, c)| (*c, *v)).collect();
    super::engine::sample_ramp_color(&pairs, t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_property_keys() {
        let geo = json!({
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": { "crop": "Wheat", "ndvi": 0.42 },
                "geometry": { "type": "Point", "coordinates": [0, 0] }
            }]
        });
        let fields = geojson_fields(&geo);
        assert!(fields.contains(&"crop".to_string()));
        assert!(fields.contains(&"ndvi".to_string()));
    }
}
