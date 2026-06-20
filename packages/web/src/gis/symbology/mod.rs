//! Per-layer symbology — presets (Phase 5) + config types (Task 32.4a).

mod preset;
mod types;
mod engine;

pub use engine::{
    forced_default_style_pack, has_saved_custom_symbology, prefers_custom_symbology,
    resolve_style_pack, sample_ramp_color, style_pack_from_config, VectorStylePack,
    FORCED_LAYER_FILL, FORCED_LAYER_FILL_OPACITY, FORCED_LAYER_LINE_WIDTH, FORCED_LAYER_POINT_RADIUS,
    FORCED_LAYER_STROKE,
};
pub use preset::{
    load_symbology, paint_for_color_name, paint_for_preset, preset_for_layer, save_symbology,
    set_layer_preset, LayerSymbology, SymbologyPreset, SYMBOLOGY_STORAGE_KEY,
};
pub use types::{
    mapbox_paint_for_config, CategoryClass, ClassBreak, SingleSymbology, SymbologyConfig,
    SymbologyStyle,
};
