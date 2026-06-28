//! Agricultural field parcels — local demo store (Task 31.15).

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::wall_clock::now_ms;

const FIELDS_STORAGE_KEY: &str = "geosyntra_fields_v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FieldRecord {
    pub id: String,
    pub name: String,
    pub tenant_id: String,
    pub crop: String,
    pub area_ha: f64,
    pub geojson: serde_json::Value,
    pub updated_at_ms: i64,
}

pub fn demo_fields(tenant_id: &str) -> Vec<FieldRecord> {
    vec![
        FieldRecord {
            id: "field-north".into(),
            name: "North parcel".into(),
            tenant_id: tenant_id.into(),
            crop: "Wheat".into(),
            area_ha: 42.5,
            geojson: json!({
                "type": "Feature",
                "properties": { "name": "North parcel", "crop": "Wheat" },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [53.2, 23.0], [53.8, 23.0], [53.8, 23.5], [53.2, 23.5], [53.2, 23.0]
                    ]]
                }
            }),
            updated_at_ms: now_ms(),
        },
        FieldRecord {
            id: "field-south".into(),
            name: "South parcel".into(),
            tenant_id: tenant_id.into(),
            crop: "Barley".into(),
            area_ha: 28.1,
            geojson: json!({
                "type": "Feature",
                "properties": { "name": "South parcel", "crop": "Barley" },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [53.3, 22.2], [54.0, 22.2], [54.0, 22.7], [53.3, 22.7], [53.3, 22.2]
                    ]]
                }
            }),
            updated_at_ms: now_ms(),
        },
    ]
}

pub fn load_fields(tenant_id: &str) -> Vec<FieldRecord> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let key = format!("{FIELDS_STORAGE_KEY}:{tenant_id}");
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(&key) {
                    if let Ok(list) = serde_json::from_str(&raw) {
                        return list;
                    }
                }
            }
        }
    }
    Vec::new()
}

pub fn save_fields(tenant_id: &str, fields: &[FieldRecord]) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let key = format!("{FIELDS_STORAGE_KEY}:{tenant_id}");
        if let Ok(json) = serde_json::to_string(fields) {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item(&key, &json);
                }
            }
        }
    }
    let _ = (tenant_id, fields);
}
