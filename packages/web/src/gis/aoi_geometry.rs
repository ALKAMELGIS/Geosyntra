//! AOI geometry edit — React `siAoiGeometryEdit.ts` (Task 32.6b).

use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DrawMode {
    View,
    Polygon,
    Rectangle,
    Circle,
    Line,
}

pub fn draw_mode_bridge_name(mode: DrawMode) -> &'static str {
    match mode {
        DrawMode::View => "view",
        DrawMode::Polygon => "polygon",
        DrawMode::Rectangle => "rectangle",
        DrawMode::Circle => "circle",
        DrawMode::Line => "line",
    }
}

pub fn rename_aoi_properties(geojson: &mut Value, name: &str) {
    if let Some(props) = geojson.get_mut("properties").and_then(|v| v.as_object_mut()) {
        props.insert("name".into(), json!(name));
    } else {
        geojson
            .as_object_mut()
            .map(|o| o.insert("properties".into(), json!({ "name": name })));
    }
}

pub fn vertex_count(geojson: &Value) -> usize {
    geojson
        .pointer("/geometry/coordinates/0")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn counts_polygon_vertices() {
        let geo = json!({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0,0],[1,0],[1,1],[0,0]]]
            }
        });
        assert_eq!(vertex_count(&geo), 4);
    }
}
