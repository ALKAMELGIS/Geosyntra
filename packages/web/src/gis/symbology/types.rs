//! Symbology types — Task 32.4a foundation (React `SymbologyConfig` / `LayerManager` subset).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// React `SymbologyStyle` — visualization mode for vector layers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SymbologyStyle {
    #[default]
    Single,
    Unique,
    Graduated,
}

/// Single-class color symbology (simple fill/line).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SingleSymbology {
    pub fill_color: String,
    pub line_color: String,
    #[serde(default = "default_line_width")]
    pub line_width: f64,
    #[serde(default = "default_fill_opacity")]
    pub fill_opacity: f64,
}

fn default_line_width() -> f64 {
    1.75
}

fn default_fill_opacity() -> f64 {
    0.42
}

impl Default for SingleSymbology {
    fn default() -> Self {
        Self {
            fill_color: "#38bdf8".into(),
            line_color: "#0ea5e9".into(),
            line_width: default_line_width(),
            fill_opacity: default_fill_opacity(),
        }
    }
}

/// Unique value class entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategoryClass {
    pub value: String,
    pub fill_color: String,
    pub line_color: String,
}

/// Graduated class break.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClassBreak {
    pub min: f64,
    pub max: f64,
    pub fill_color: String,
    pub line_color: String,
}

/// Full layer symbology config persisted with custom layers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SymbologyConfig {
    pub style: SymbologyStyle,
    #[serde(default)]
    pub field: Option<String>,
    #[serde(default)]
    pub single: SingleSymbology,
    #[serde(default)]
    pub categories: Vec<CategoryClass>,
    #[serde(default)]
    pub breaks: Vec<ClassBreak>,
    #[serde(default)]
    pub user_configured: bool,
    #[serde(default)]
    pub use_arcgis_online: bool,
}

impl Default for SymbologyConfig {
    fn default() -> Self {
        Self {
            style: SymbologyStyle::Single,
            field: None,
            single: SingleSymbology::default(),
            categories: Vec::new(),
            breaks: Vec::new(),
            user_configured: false,
            use_arcgis_online: false,
        }
    }
}

/// Build Mapbox GL fill/line paint from symbology config (single + unique value MVP).
pub fn mapbox_paint_for_config(config: &SymbologyConfig) -> (Value, Value) {
    match config.style {
        SymbologyStyle::Single => {
            let fill = serde_json::json!({
                "fill-color": config.single.fill_color,
                "fill-opacity": config.single.fill_opacity,
            });
            let line = serde_json::json!({
                "line-color": config.single.line_color,
                "line-width": config.single.line_width,
            });
            (fill, line)
        }
        SymbologyStyle::Unique if config.field.as_deref().unwrap_or("").is_empty() => {
            mapbox_paint_for_config(&SymbologyConfig {
                style: SymbologyStyle::Single,
                ..SymbologyConfig::default()
            })
        }
        SymbologyStyle::Unique => {
            let field = config.field.as_deref().unwrap_or("");
            let fill_colors: Vec<Value> = config
                .categories
                .iter()
                .map(|c| serde_json::json!([c.value, c.fill_color]))
                .collect();
            let line_colors: Vec<Value> = config
                .categories
                .iter()
                .map(|c| serde_json::json!([c.value, c.line_color]))
                .collect();
            let fill = serde_json::json!({
                "fill-color": ["match", ["get", field], fill_colors, config.single.fill_color],
                "fill-opacity": config.single.fill_opacity,
            });
            let line = serde_json::json!({
                "line-color": ["match", ["get", field], line_colors, config.single.line_color],
                "line-width": config.single.line_width,
            });
            (fill, line)
        }
        SymbologyStyle::Graduated => {
            // MVP: fall back to single until engine step 32.4c
            mapbox_paint_for_config(&SymbologyConfig {
                style: SymbologyStyle::Single,
                single: config.single.clone(),
                ..SymbologyConfig::default()
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_paint_uses_config_colors() {
        let config = SymbologyConfig {
            single: SingleSymbology {
                fill_color: "#ff0000".into(),
                line_color: "#00ff00".into(),
                ..SingleSymbology::default()
            },
            ..SymbologyConfig::default()
        };
        let (fill, _) = mapbox_paint_for_config(&config);
        assert_eq!(fill.get("fill-color").and_then(|v| v.as_str()), Some("#ff0000"));
    }

    #[test]
    fn unique_value_builds_match_expression() {
        let config = SymbologyConfig {
            style: SymbologyStyle::Unique,
            field: Some("crop".into()),
            categories: vec![CategoryClass {
                value: "Wheat".into(),
                fill_color: "#fbbf24".into(),
                line_color: "#d97706".into(),
            }],
            ..SymbologyConfig::default()
        };
        let (fill, _) = mapbox_paint_for_config(&config);
        assert!(fill.get("fill-color").and_then(|v| v.as_array()).is_some());
    }
}
