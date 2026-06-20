//! Per-layer symbology — presets (Phase 5) + config types (Task 32.4a).

mod preset;
mod types;

pub use preset::{
    load_symbology, paint_for_color_name, paint_for_preset, preset_for_layer, save_symbology,
    set_layer_preset, LayerSymbology, SymbologyPreset, SYMBOLOGY_STORAGE_KEY,
};
pub use types::{
    mapbox_paint_for_config, CategoryClass, ClassBreak, SingleSymbology, SymbologyConfig,
    SymbologyStyle,
};
