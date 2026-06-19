//! Per-layer symbology presets — Phase 5 MVP (React `siLayerSymbologyEngine` subset).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SYMBOLOGY_STORAGE_KEY: &str = "geosyntra_gis_symbology_v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayerSymbology {
    pub layer_id: String,
    pub preset: SymbologyPreset,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SymbologyPreset {
    #[default]
    Blue,
    Green,
    Orange,
    Red,
    Purple,
}

impl SymbologyPreset {
    pub fn all() -> &'static [(&'static str, SymbologyPreset)] {
        &[
            ("Blue", SymbologyPreset::Blue),
            ("Green", SymbologyPreset::Green),
            ("Orange", SymbologyPreset::Orange),
            ("Red", SymbologyPreset::Red),
            ("Purple", SymbologyPreset::Purple),
        ]
    }

    pub fn as_str(self) -> &'static str {
        match self {
            SymbologyPreset::Blue => "blue",
            SymbologyPreset::Green => "green",
            SymbologyPreset::Orange => "orange",
            SymbologyPreset::Red => "red",
            SymbologyPreset::Purple => "purple",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "green" => SymbologyPreset::Green,
            "orange" => SymbologyPreset::Orange,
            "red" => SymbologyPreset::Red,
            "purple" => SymbologyPreset::Purple,
            _ => SymbologyPreset::Blue,
        }
    }
}

pub fn paint_for_preset(preset: SymbologyPreset) -> Value {
    match preset {
        SymbologyPreset::Green => json!({ "fill-color": "#4ade80", "line-color": "#22c55e" }),
        SymbologyPreset::Orange => json!({ "fill-color": "#fb923c", "line-color": "#f97316" }),
        SymbologyPreset::Red => json!({ "fill-color": "#f87171", "line-color": "#ef4444" }),
        SymbologyPreset::Purple => json!({ "fill-color": "#c084fc", "line-color": "#a855f7" }),
        SymbologyPreset::Blue => json!({ "fill-color": "#38bdf8", "line-color": "#0ea5e9" }),
    }
}

pub fn paint_for_color_name(color: &str) -> Value {
    paint_for_preset(SymbologyPreset::parse(color))
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
struct SymbologyStore {
    #[serde(default)]
    layers: Vec<LayerSymbology>,
}

pub fn load_symbology(tenant_id: &str) -> Vec<LayerSymbology> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let key = format!("{SYMBOLOGY_STORAGE_KEY}:{tenant_id}");
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(&key) {
                    if let Ok(store) = serde_json::from_str::<SymbologyStore>(&raw) {
                        return store.layers;
                    }
                }
            }
        }
    }
    let _ = tenant_id;
    Vec::new()
}

pub fn save_symbology(tenant_id: &str, layers: &[LayerSymbology]) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let key = format!("{SYMBOLOGY_STORAGE_KEY}:{tenant_id}");
        let store = SymbologyStore {
            layers: layers.to_vec(),
        };
        if let Ok(json) = serde_json::to_string(&store) {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item(&key, &json);
                }
            }
        }
    }
    let _ = (tenant_id, layers);
}

pub fn preset_for_layer(tenant_id: &str, layer_id: &str) -> SymbologyPreset {
    load_symbology(tenant_id)
        .into_iter()
        .find(|s| s.layer_id == layer_id)
        .map(|s| s.preset)
        .unwrap_or_default()
}

pub fn set_layer_preset(tenant_id: &str, layer_id: &str, preset: SymbologyPreset) {
    let mut rows = load_symbology(tenant_id);
    if let Some(row) = rows.iter_mut().find(|r| r.layer_id == layer_id) {
        row.preset = preset;
    } else {
        rows.push(LayerSymbology {
            layer_id: layer_id.to_string(),
            preset,
        });
    }
    save_symbology(tenant_id, &rows);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_paint_colors_differ() {
        let blue = paint_for_preset(SymbologyPreset::Blue);
        let green = paint_for_preset(SymbologyPreset::Green);
        assert_ne!(blue, green);
    }

    #[test]
    fn parses_color_names() {
        assert_eq!(SymbologyPreset::parse("orange"), SymbologyPreset::Orange);
    }
}
