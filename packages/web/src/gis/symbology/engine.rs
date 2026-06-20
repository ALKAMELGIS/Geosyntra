//! Symbology engine — Mapbox style packs (Task 32.4b, React `siLayerSymbologyEngine` subset).

use serde_json::{json, Value};

use super::types::{
    mapbox_paint_for_config, ClassBreak, SymbologyConfig, SymbologyStyle,
};

pub const FORCED_LAYER_STROKE: &str = "#22c55e";
pub const FORCED_LAYER_FILL: &str = "rgba(34, 197, 94, 0.42)";
pub const FORCED_LAYER_FILL_OPACITY: f64 = 0.42;
pub const FORCED_LAYER_LINE_WIDTH: f64 = 2.0;
pub const FORCED_LAYER_POINT_RADIUS: f64 = 5.0;

#[derive(Debug, Clone, PartialEq)]
pub struct VectorStylePack {
    pub fill_paint: Value,
    pub line_paint: Value,
    pub circle_paint: Value,
}

pub fn has_saved_custom_symbology(config: &SymbologyConfig) -> bool {
    config.user_configured
}

pub fn prefers_custom_symbology(config: &SymbologyConfig) -> bool {
    !config.use_arcgis_online
}

/// Default hollow outline for upload layers until user saves symbology.
pub fn forced_default_style_pack() -> VectorStylePack {
    VectorStylePack {
        fill_paint: json!({
            "fill-color": FORCED_LAYER_FILL,
            "fill-opacity": FORCED_LAYER_FILL_OPACITY,
        }),
        line_paint: json!({
            "line-color": FORCED_LAYER_STROKE,
            "line-width": FORCED_LAYER_LINE_WIDTH,
        }),
        circle_paint: json!({
            "circle-radius": FORCED_LAYER_POINT_RADIUS,
            "circle-color": FORCED_LAYER_FILL,
            "circle-stroke-width": 1.0,
            "circle-stroke-color": FORCED_LAYER_STROKE,
        }),
    }
}

pub fn style_pack_from_config(config: &SymbologyConfig) -> VectorStylePack {
    let (fill, line) = match config.style {
        SymbologyStyle::Graduated if config.field.as_deref().unwrap_or("").is_empty() => {
            mapbox_paint_for_config(&SymbologyConfig {
                style: SymbologyStyle::Single,
                single: config.single.clone(),
                ..SymbologyConfig::default()
            })
        }
        SymbologyStyle::Graduated => {
            graduated_paint_for_config(config)
        }
        _ => mapbox_paint_for_config(config),
    };
    let point_color = config.single.fill_color.clone();
    VectorStylePack {
        fill_paint: fill,
        line_paint: line,
        circle_paint: json!({
            "circle-radius": FORCED_LAYER_POINT_RADIUS,
            "circle-color": point_color,
            "circle-stroke-width": 1.0,
            "circle-stroke-color": config.single.line_color,
        }),
    }
}

/// Resolve paints: forced default until user saves custom symbology.
pub fn resolve_style_pack(config: Option<&SymbologyConfig>) -> VectorStylePack {
    match config {
        Some(c) if has_saved_custom_symbology(c) => style_pack_from_config(c),
        _ => forced_default_style_pack(),
    }
}

fn graduated_paint_for_config(config: &SymbologyConfig) -> (Value, Value) {
    let field = config.field.as_deref().unwrap_or("");
    let default_fill = config.single.fill_color.clone();
    let default_line = config.single.line_color.clone();
    if config.breaks.is_empty() {
        return mapbox_paint_for_config(&SymbologyConfig {
            style: SymbologyStyle::Single,
            single: config.single.clone(),
            ..SymbologyConfig::default()
        });
    }
    let fill = graduated_step_paint(field, &config.breaks, &default_fill, "fill-color", config.single.fill_opacity);
    let line = graduated_step_paint(field, &config.breaks, &default_line, "line-color", 1.0);
    (fill, line)
}

fn graduated_step_paint(
    field: &str,
    breaks: &[ClassBreak],
    default: &str,
    color_key: &str,
    opacity: f64,
) -> Value {
    let mut expr = vec![
        json!("step"),
        json!(["get", field]),
        json!(default),
    ];
    for br in breaks {
        expr.push(json!(br.min));
        expr.push(json!(if color_key == "line-color" {
            br.line_color.clone()
        } else {
            br.fill_color.clone()
        }));
    }
    if color_key == "line-color" {
        json!({
            color_key: expr,
            "line-width": 1.75,
        })
    } else {
        json!({
            color_key: expr,
            "fill-opacity": opacity,
        })
    }
}

/// Sample ramp color at normalized position 0..1 (React `sampleRamp` subset).
pub fn sample_ramp_color(stops: &[(&str, f64)], t: f64) -> String {
    if stops.is_empty() {
        return "#38bdf8".into();
    }
    let t = t.clamp(0.0, 1.0);
    for window in stops.windows(2) {
        let (c0, t0) = window[0];
        let (c1, t1) = window[1];
        if t >= t0 && t <= t1 {
            return c0.to_string();
        }
        let _ = c1;
    }
    stops.last().map(|(c, _)| (*c).to_string()).unwrap_or_else(|| "#38bdf8".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gis::symbology::types::{CategoryClass, SingleSymbology};

    #[test]
    fn forced_pack_uses_green_stroke() {
        let pack = forced_default_style_pack();
        assert_eq!(
            pack.line_paint.get("line-color").and_then(|v| v.as_str()),
            Some(FORCED_LAYER_STROKE)
        );
    }

    #[test]
    fn unsaved_layer_gets_forced_style() {
        let config = SymbologyConfig {
            style: SymbologyStyle::Single,
            user_configured: false,
            ..SymbologyConfig::default()
        };
        let pack = resolve_style_pack(Some(&config));
        assert_eq!(
            pack.line_paint.get("line-color").and_then(|v| v.as_str()),
            Some(FORCED_LAYER_STROKE)
        );
    }

    #[test]
    fn saved_single_uses_custom_color() {
        let config = SymbologyConfig {
            style: SymbologyStyle::Single,
            user_configured: true,
            single: SingleSymbology {
                fill_color: "#f97316".into(),
                line_color: "#ea580c".into(),
                ..SingleSymbology::default()
            },
            ..SymbologyConfig::default()
        };
        let pack = resolve_style_pack(Some(&config));
        assert_eq!(
            pack.circle_paint.get("circle-color").and_then(|v| v.as_str()),
            Some("#f97316")
        );
    }

    #[test]
    fn graduated_builds_step_expression() {
        let config = SymbologyConfig {
            style: SymbologyStyle::Graduated,
            field: Some("ndvi".into()),
            user_configured: true,
            breaks: vec![
                ClassBreak {
                    min: 0.0,
                    max: 0.3,
                    fill_color: "#ef4444".into(),
                    line_color: "#ef4444".into(),
                },
                ClassBreak {
                    min: 0.3,
                    max: 0.6,
                    fill_color: "#eab308".into(),
                    line_color: "#eab308".into(),
                },
            ],
            ..SymbologyConfig::default()
        };
        let pack = style_pack_from_config(&config);
        let fill = pack.fill_paint.get("fill-color").and_then(|v| v.as_array());
        assert!(fill.is_some());
        assert_eq!(fill.unwrap().first().and_then(|v| v.as_str()), Some("step"));
    }

    #[test]
    fn unique_value_when_saved() {
        let config = SymbologyConfig {
            style: SymbologyStyle::Unique,
            field: Some("crop".into()),
            user_configured: true,
            categories: vec![CategoryClass {
                value: "Wheat".into(),
                fill_color: "#fbbf24".into(),
                line_color: "#d97706".into(),
            }],
            ..SymbologyConfig::default()
        };
        let pack = style_pack_from_config(&config);
        assert!(pack
            .fill_paint
            .get("fill-color")
            .and_then(|v| v.as_array())
            .is_some());
    }
}
