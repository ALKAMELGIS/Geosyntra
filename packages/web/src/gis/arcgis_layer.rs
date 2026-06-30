//! ArcGIS FeatureServer client — React `arcgisFeatureLayerClient.ts` (Task 32.3c).

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ArcgisLayerRef {
    pub service_url: String,
    pub layer_id: u32,
}

pub fn parse_arcgis_feature_layer_ref(input: &str) -> Option<ArcgisLayerRef> {
    let trimmed = input.trim().trim_end_matches('/');
    if !trimmed.contains("FeatureServer") && !trimmed.contains("MapServer") {
        return None;
    }
    let parts: Vec<&str> = trimmed.rsplitn(2, '/').collect();
    if parts.len() != 2 {
        return None;
    }
    let layer_id = parts[0].parse().ok()?;
    Some(ArcgisLayerRef {
        service_url: parts[1].to_string(),
        layer_id,
    })
}

pub fn query_geojson_url(layer: &ArcgisLayerRef, token: Option<&str>) -> String {
    let mut url = format!(
        "{}/{}?f=geojson&where=1%3D1&outFields=*&returnGeometry=true",
        layer.service_url.trim_end_matches('/'),
        layer.layer_id
    );
    if let Some(t) = token.filter(|s| !s.is_empty()) {
        url.push_str("&token=");
        url.push_str(t);
    }
    url
}

pub fn bounds_from_geojson(geojson: &Value) -> Option<[f64; 4]> {
    crate::gis::aoi_bounds(geojson)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_feature_server_url() {
        let r = parse_arcgis_feature_layer_ref(
            "https://services.arcgis.com/x/FeatureServer/0",
        )
        .expect("parse");
        assert_eq!(r.layer_id, 0);
        assert!(r.service_url.contains("FeatureServer"));
    }
}
