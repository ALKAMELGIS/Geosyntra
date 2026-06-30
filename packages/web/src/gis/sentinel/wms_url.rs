//! Sentinel Hub WMS tile URL builder — React `buildLegacyWmsTileUrl` parity.

use super::aoi_clip::AoiClipResult;

pub const SENTINEL_HUB_PUBLIC_INSTANCE_ID: &str = "60de79ca-16a7-4afd-bcbd-0261bf0156fa";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WmsTimeExtent {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone)]
pub struct WmsTileUrlParams<'a> {
    pub base_url: String,
    pub logical_layer_id: &'a str,
    pub tile_layer_name: &'a str,
    pub time: WmsTimeExtent,
    pub cloud_cover: u8,
    pub clip: Option<&'a AoiClipResult>,
}

pub fn default_wms_base_url(instance_id: Option<&str>) -> String {
    let id = instance_id
        .filter(|s| !s.is_empty())
        .unwrap_or(SENTINEL_HUB_PUBLIC_INSTANCE_ID);
    format!("https://services.sentinel-hub.com/ogc/wms/{id}")
}

pub fn uses_max_cloud_cover(logical_layer_id: &str, tile_layer_name: &str) -> bool {
    let a = logical_layer_id.to_ascii_uppercase();
    let b = tile_layer_name.to_ascii_uppercase();
    !a.contains("S1") && !b.contains("S1") && !a.contains("INSAR") && !b.contains("INSAR")
}

pub fn build_wms_tile_url(params: WmsTileUrlParams<'_>) -> String {
    let safe_layer = urlencoding::encode(params.tile_layer_name);
    let maxcc = if uses_max_cloud_cover(params.logical_layer_id, params.tile_layer_name) {
        format!("&MAXCC={}", params.cloud_cover.min(100))
    } else {
        String::new()
    };
    let start = params.time.start.trim();
    let end = params.time.end.trim();
    let mut url = format!(
        "{}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={}&BBOX={{bbox-epsg-3857}}&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true&WIDTH=512&HEIGHT=512&TIME={}/{}&SHOWLOGO=false&WARNINGS=false{}",
        params.base_url.trim_end_matches('/'),
        safe_layer,
        start,
        end,
        maxcc
    );
    if let Some(clip) = params.clip {
        if let Some(wkt) = clip.geometry_wkt_3857.as_deref() {
            url.push_str("&GEOMETRY=");
            url.push_str(&urlencoding::encode(wkt));
        }
        if let Some(b64) = clip.evalscript_b64.as_deref() {
            url.push_str("&EVALSCRIPT=");
            url.push_str(&urlencoding::encode(b64));
        }
    }
    url
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gis::sentinel::aoi_clip::clip_from_geojson;
    use serde_json::json;

    #[test]
    fn includes_time_and_layer() {
        let url = build_wms_tile_url(WmsTileUrlParams {
            base_url: default_wms_base_url(None),
            logical_layer_id: "NDVI",
            tile_layer_name: "NDVI",
            time: WmsTimeExtent {
                start: "2026-01-01".into(),
                end: "2026-01-07".into(),
            },
            cloud_cover: 15,
            clip: None,
        });
        assert!(url.contains("LAYERS=NDVI"));
        assert!(url.contains("TIME=2026-01-01/2026-01-07"));
        assert!(url.contains("MAXCC=15"));
        assert!(url.contains("{bbox-epsg-3857}"));
    }

    #[test]
    fn appends_geometry_when_clip_present() {
        let geo = json!({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0]]]
            }
        });
        let clip = clip_from_geojson(&geo).expect("clip");
        let url = build_wms_tile_url(WmsTileUrlParams {
            base_url: default_wms_base_url(None),
            logical_layer_id: "NDVI",
            tile_layer_name: "NDVI",
            time: WmsTimeExtent {
                start: "2026-01-01".into(),
                end: "2026-01-01".into(),
            },
            cloud_cover: 20,
            clip: Some(&clip),
        });
        assert!(url.contains("GEOMETRY="));
    }
}
