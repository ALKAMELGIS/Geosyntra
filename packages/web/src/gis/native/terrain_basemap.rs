//! Esri World Elevation Terrain — React `esriWorldElevationTerrainBasemap.ts` (Task 32.1b).

use serde_json::{json, Value};

pub const TERRAIN_BASEMAP_ID: &str = "esri-world-elevation-terrain";

const ESRI: &str = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ATTR: &str = "Tiles © Esri";

fn esri_tile(service: &str) -> String {
    format!("{ESRI}/{service}/MapServer/tile/{{z}}/{{y}}/{{x}}")
}

/// Relief underlay layers (terrain + hillshade) for 3D globe.
pub fn terrain_underlay_layers() -> Vec<(String, f64)> {
    vec![
        (esri_tile("World_Terrain_Base"), 1.0),
        (esri_tile("World_Hillshade"), 0.52),
    ]
}

/// Full standalone terrain basemap style.
pub fn style_for_terrain_basemap() -> Value {
    let mut layers_spec = terrain_underlay_layers();
    layers_spec.push((esri_tile("Reference/World_Reference_Overlay"), 0.88));
    build_raster_style(&layers_spec)
}

fn build_raster_style(layers_spec: &[(String, f64)]) -> Value {
    let mut sources = serde_json::Map::new();
    let mut layers = Vec::new();
    for (i, (url, opacity)) in layers_spec.iter().enumerate() {
        let sid = format!("terrain-{i}");
        sources.insert(
            sid.clone(),
            json!({
                "type": "raster",
                "tiles": [url],
                "tileSize": 256,
                "attribution": ATTR,
            }),
        );
        layers.push(json!({
            "id": format!("layer-{i}"),
            "type": "raster",
            "source": sid,
            "paint": { "raster-opacity": opacity },
        }));
    }
    json!({
        "version": 8,
        "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        "sources": sources,
        "layers": layers,
    })
}

/// Merge terrain underlay sources/layers beneath an existing raster basemap style.
pub fn merge_terrain_underlay(base: &Value) -> Value {
    let mut merged = base.clone();
    let Some(obj) = merged.as_object_mut() else {
        return style_for_terrain_basemap();
    };
    let mut source_map = obj
        .get("sources")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let mut underlay_layers = Vec::new();
    for (i, (url, opacity)) in terrain_underlay_layers().into_iter().enumerate() {
        let sid = format!("gs-terrain-{i}");
        source_map.insert(
            sid.clone(),
            json!({
                "type": "raster",
                "tiles": [url],
                "tileSize": 256,
                "attribution": ATTR,
            }),
        );
        underlay_layers.push(json!({
            "id": format!("gs-terrain-layer-{i}"),
            "type": "raster",
            "source": sid,
            "paint": { "raster-opacity": opacity },
        }));
    }
    obj.insert("sources".into(), json!(source_map));
    let existing = obj.get("layers").cloned().unwrap_or(json!([]));
    let mut all = underlay_layers;
    if let Some(arr) = existing.as_array() {
        all.extend(arr.iter().cloned());
    }
    obj.insert("layers".into(), json!(all));
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gis::native::basemap::style_for_basemap;

    #[test]
    fn terrain_style_has_layers() {
        let style = style_for_terrain_basemap();
        assert!(style.get("layers").and_then(|v| v.as_array()).unwrap().len() >= 2);
    }

    #[test]
    fn merge_prepends_underlay() {
        let base = style_for_basemap("esri");
        let merged = merge_terrain_underlay(&base);
        let layers = merged.get("layers").and_then(|v| v.as_array()).unwrap();
        assert!(layers
            .first()
            .unwrap()
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .starts_with("gs-terrain"));
    }
}
