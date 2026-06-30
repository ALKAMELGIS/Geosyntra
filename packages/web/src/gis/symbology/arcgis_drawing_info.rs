//! ArcGIS drawingInfo → Mapbox paint — React `arcgisDrawingInfoMapbox.ts` (Task 32.4d).

use serde_json::{json, Value};

pub fn supports_mapbox_render(drawing_info: &Value) -> bool {
    drawing_info
        .pointer("/renderer/type")
        .and_then(|v| v.as_str())
        .map(|t| matches!(t, "simple" | "uniqueValue" | "classBreaks"))
        .unwrap_or(false)
}

pub fn fill_paint_from_drawing_info(drawing_info: &Value) -> Option<Value> {
    let renderer = drawing_info.get("renderer")?;
    match renderer.get("type").and_then(|v| v.as_str())? {
        "simple" => simple_color(renderer.get("symbol")?).map(|c| {
            json!({ "fill-color": c, "fill-opacity": 0.55 })
        }),
        "uniqueValue" => {
            let field = renderer.get("field1").and_then(|v| v.as_str())?;
            let pairs = unique_value_pairs(renderer)?;
            Some(json!({
                "fill-color": ["match", ["get", field], pairs, "#94a3b8"],
                "fill-opacity": 0.55,
            }))
        }
        _ => None,
    }
}

pub fn line_paint_from_drawing_info(drawing_info: &Value) -> Option<Value> {
    let renderer = drawing_info.get("renderer")?;
    simple_color(renderer.get("symbol")?).map(|c| {
        json!({ "line-color": c, "line-width": 1.75 })
    })
}

fn simple_color(symbol: &Value) -> Option<String> {
    let arr = symbol.get("color")?.as_array()?;
    if arr.len() < 3 {
        return None;
    }
    let r = arr[0].as_u64()? as u8;
    let g = arr[1].as_u64()? as u8;
    let b = arr[2].as_u64()? as u8;
    Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
}

fn unique_value_pairs(renderer: &Value) -> Option<Vec<Value>> {
    let infos = renderer.get("uniqueValueInfos")?.as_array()?;
    let mut pairs = Vec::new();
    for info in infos {
        let value = info.get("value")?;
        let color = simple_color(info.get("symbol")?)?;
        pairs.push(json!(value));
        pairs.push(json!(color));
    }
    if pairs.is_empty() {
        None
    } else {
        Some(pairs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn supports_unique_value() {
        let di = json!({
            "renderer": {
                "type": "uniqueValue",
                "field1": "type",
                "uniqueValueInfos": [
                    { "value": "A", "symbol": { "color": [255, 0, 0, 255] } }
                ]
            }
        });
        assert!(supports_mapbox_render(&di));
        assert!(fill_paint_from_drawing_info(&di).is_some());
    }
}
