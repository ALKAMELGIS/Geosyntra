use serde_json::{json, Value};

use crate::{
    api::gis::aoi::{delete_aoi as delete_aoi_api, list_aoi, upsert_aoi},
    wall_clock::now_ms,
};

use super::{list_aois, save_aoi, AoiRecord};

pub fn record_from_api(value: &Value, tenant_id: &str, email: &str) -> Option<AoiRecord> {
    let id = value
        .get("id")
        .and_then(|v| v.as_str().map(String::from))
        .or_else(|| {
            value
                .get("id")
                .and_then(|v| v.as_i64())
                .map(|n| n.to_string())
        })?;
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("AOI")
        .to_string();
    let geojson = if value.get("type").and_then(|v| v.as_str()) == Some("Feature") {
        value.clone()
    } else if let Some(geometry) = value.get("geometry") {
        json!({
            "type": "Feature",
            "id": id,
            "geometry": geometry,
            "properties": value.get("properties").cloned().unwrap_or(json!({})),
        })
    } else {
        return None;
    };
    Some(AoiRecord {
        id,
        name,
        tenant_id: tenant_id.to_string(),
        email: email.to_string(),
        geojson,
        updated_at_ms: now_ms(),
    })
}

pub fn record_to_api_body(record: &AoiRecord) -> Value {
    json!({
        "id": record.id,
        "name": record.name,
        "geometry": record
            .geojson
            .get("geometry")
            .cloned()
            .unwrap_or(record.geojson.clone()),
    })
}

pub async fn load_aois_for_session(
    tenant_id: &str,
    email: &str,
    token: Option<&str>,
) -> Vec<AoiRecord> {
    if let Some(token) = token.filter(|t| !t.is_empty()) {
        if let Ok(items) = list_aoi(token).await {
            let records: Vec<AoiRecord> = items
                .iter()
                .filter_map(|item| record_from_api(item, tenant_id, email))
                .collect();
            for record in &records {
                let _ = save_aoi(record.clone());
            }
            return records;
        }
    }
    list_aois(tenant_id, email)
}

pub async fn persist_aoi(record: &AoiRecord, token: Option<&str>) -> AoiRecord {
    let saved = save_aoi(record.clone());
    if let Some(token) = token.filter(|t| !t.is_empty()) {
        let _ = upsert_aoi(&record_to_api_body(&saved), token).await;
    }
    saved
}

pub async fn remove_aoi(tenant_id: &str, email: &str, id: &str, token: Option<&str>) -> bool {
    let local = super::delete_aoi(tenant_id, email, id);
    if let Some(token) = token.filter(|t| !t.is_empty()) {
        let _ = delete_aoi_api(id, token).await;
    }
    local
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn record_from_api_polygon() {
        let value = json!({
            "id": "aoi-1",
            "name": "Field",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0]]]
            }
        });
        let record = record_from_api(&value, "tenant-a", "user@test.local").expect("record");
        assert_eq!(record.id, "aoi-1");
        assert_eq!(record.name, "Field");
    }
}
