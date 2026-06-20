//! Per-layer symbology — presets (Phase 5) + config types (Task 32.4a).

mod arcgis_drawing_info;
mod engine;
mod helpers;
mod preset;
mod types;
mod wms_legend;

pub use arcgis_drawing_info::{
    fill_paint_from_drawing_info, line_paint_from_drawing_info, supports_mapbox_render,
};
pub use engine::{
    forced_default_style_pack, has_saved_custom_symbology, prefers_custom_symbology,
    resolve_style_pack, sample_ramp_color, style_pack_from_config, VectorStylePack,
    FORCED_LAYER_FILL, FORCED_LAYER_FILL_OPACITY, FORCED_LAYER_LINE_WIDTH, FORCED_LAYER_POINT_RADIUS,
    FORCED_LAYER_STROKE,
};
pub use helpers::{geojson_fields, numeric_fields, sample_ramp_stops};
pub use preset::{
    load_symbology, paint_for_color_name, paint_for_preset, preset_for_layer, save_symbology,
    set_layer_preset, LayerSymbology, SymbologyPreset, SYMBOLOGY_STORAGE_KEY,
};
pub use types::{
    mapbox_paint_for_config, CategoryClass, ClassBreak, SingleSymbology, SymbologyConfig,
    SymbologyStyle,
};
pub use wms_legend::{
    ndvi_classification_stops, stops_for_index, thin_legend_segments, WmsLegendSegment,
    WmsRampStop,
};
