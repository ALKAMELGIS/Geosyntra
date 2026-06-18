use serde::{Deserialize, Serialize};

use crate::wall_clock::now_ms;

pub const AOI_STORAGE_KEY: &str = "geosyntra_aoi_v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AoiRecord {
    pub id: String,
    pub name: String,
    pub tenant_id: String,
    pub email: String,
    pub geojson: serde_json::Value,
    pub updated_at_ms: i64,
}

fn storage_key(tenant_id: &str, email: &str) -> String {
    format!(
        "{}:{}",
        email.trim().to_ascii_lowercase(),
        tenant_id.trim()
    )
}

fn read_all() -> std::collections::HashMap<String, Vec<AoiRecord>> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(AOI_STORAGE_KEY) {
                    if let Ok(map) = serde_json::from_str(&raw) {
                        return map;
                    }
                }
            }
        }
    }
    std::collections::HashMap::new()
}

fn write_all(all: &std::collections::HashMap<String, Vec<AoiRecord>>) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Ok(json) = serde_json::to_string(all) {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item(AOI_STORAGE_KEY, &json);
                }
            }
        }
    }
    let _ = all;
}

pub fn list_aois(tenant_id: &str, email: &str) -> Vec<AoiRecord> {
    let key = storage_key(tenant_id, email);
    read_all().get(&key).cloned().unwrap_or_default()
}

pub fn save_aoi(record: AoiRecord) -> AoiRecord {
    let key = storage_key(&record.tenant_id, &record.email);
    let mut all = read_all();
    let mut list = all.remove(&key).unwrap_or_default();
    if let Some(idx) = list.iter().position(|r| r.id == record.id) {
        list[idx] = record.clone();
    } else {
        list.push(record.clone());
    }
    all.insert(key, list);
    write_all(&all);
    record
}

pub fn delete_aoi(tenant_id: &str, email: &str, id: &str) -> bool {
    let key = storage_key(tenant_id, email);
    let mut all = read_all();
    let Some(list) = all.get_mut(&key) else {
        return false;
    };
    let before = list.len();
    list.retain(|r| r.id != id);
    if list.len() == before {
        return false;
    }
    write_all(&all);
    true
}

pub fn load_aoi_geojson_collection(tenant_id: &str, email: &str) -> serde_json::Value {
    let features: Vec<serde_json::Value> = list_aois(tenant_id, email)
        .into_iter()
        .map(|r| {
            let geo = r.geojson.clone();
            let geometry = geo
                .get("geometry")
                .cloned()
                .unwrap_or(geo);
            serde_json::json!({
                "type": "Feature",
                "id": r.id,
                "properties": { "name": r.name, "aoiId": r.id },
                "geometry": geometry,
            })
        })
        .collect();
    serde_json::json!({ "type": "FeatureCollection", "features": features })
}

pub fn upsert_aoi_from_geojson(
    tenant_id: &str,
    email: &str,
    name: &str,
    feature: &serde_json::Value,
) -> AoiRecord {
    let id = feature
        .get("id")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("aoi-{}", now_ms()));
    save_aoi(AoiRecord {
        id,
        name: name.to_string(),
        tenant_id: tenant_id.to_string(),
        email: email.to_string(),
        geojson: feature.clone(),
        updated_at_ms: now_ms(),
    })
}

/// Bounding box [west, south, east, north] from GeoJSON geometry.
pub fn aoi_bounds(geojson: &serde_json::Value) -> Option<[f64; 4]> {
    let coords = extract_coords(geojson)?;
    if coords.is_empty() {
        return None;
    }
    let mut west = f64::INFINITY;
    let mut south = f64::INFINITY;
    let mut east = f64::NEG_INFINITY;
    let mut north = f64::NEG_INFINITY;
    for (lng, lat) in coords {
        west = west.min(lng);
        south = south.min(lat);
        east = east.max(lng);
        north = north.max(lat);
    }
    Some([west, south, east, north])
}

fn extract_coords(value: &serde_json::Value) -> Option<Vec<(f64, f64)>> {
    let geom = value.get("geometry").unwrap_or(value);
    let typ = geom.get("type")?.as_str()?;
    let coords = geom.get("coordinates")?;
    match typ {
        "Point" => {
            let arr = coords.as_array()?;
            Some(vec![(arr[0].as_f64()?, arr[1].as_f64()?)])
        }
        "Polygon" => flatten_polygon(coords),
        "MultiPolygon" => {
            let mut out = Vec::new();
            for poly in coords.as_array()? {
                if let Some(mut ring) = flatten_polygon(poly) {
                    out.append(&mut ring);
                }
            }
            Some(out)
        }
        _ => None,
    }
}

fn flatten_polygon(coords: &serde_json::Value) -> Option<Vec<(f64, f64)>> {
    let ring = coords.as_array()?.first()?.as_array()?;
    Some(
        ring.iter()
            .filter_map(|p| {
                let a = p.as_array()?;
                Some((a[0].as_f64()?, a[1].as_f64()?))
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aoi_bounds_from_polygon() {
        let geo = serde_json::json!({
            "type": "Polygon",
            "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]]
        });
        assert_eq!(aoi_bounds(&geo), Some([0.0, 0.0, 1.0, 1.0]));
    }
}
