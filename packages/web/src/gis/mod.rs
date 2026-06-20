//! GIS domain types and persistence.

mod aoi;
mod aoi_remote;
mod aoi_report;
mod fields;
mod index_catalog;
mod layers;
mod remote_sensing;
pub mod sentinel;
mod symbology;
pub mod parity;
pub mod native;

pub use aoi::{
    aoi_bounds, delete_aoi, list_aois, load_aoi_geojson_collection, save_aoi, upsert_aoi_from_geojson,
    AoiRecord,
};
pub use aoi_remote::{load_aois_for_session, persist_aoi, remove_aoi};
pub use aoi_report::{
    build_aoi_vegetation_report, AoiVegetationReport, BuildReportInput, ChangeDetectionSlot,
    ReportIndexId, ReportTableRow, ReportTimePoint, TimelineWeekInput,
};
pub use fields::{load_fields, save_fields, FieldRecord};
pub use remote_sensing::{
    collections_for, iso_days_ago, iso_today, providers, RemoteSensingSettings, RemoteSensingStore,
    SatelliteCollection, SatelliteProvider, DEFAULT_COLLECTION_ID, DEFAULT_PROVIDER_ID,
};
pub use index_catalog::{
    catalog as index_catalog, label_for as index_label_for, resolve_index_id, IndexLayerDef,
    DEFAULT_INDEX_ID,
};
pub use sentinel::wms_tile_url_simple as wms_tile_url;
pub use sentinel::{
    build_weekly_timeline, wms_tile_url_for_index, wms_tile_url_simple, TimelineWeek,
    WmsTimeExtent,
};
pub use layers::{AddedLayer, LayerKind, LayerSettings, LayerStore, INDEX_RASTER_LAYER_ID};
pub use symbology::{
    load_symbology, paint_for_color_name, paint_for_preset, preset_for_layer, set_layer_preset,
    resolve_style_pack, style_pack_from_config, forced_default_style_pack, FORCED_LAYER_STROKE,
    CategoryClass, LayerSymbology, SymbologyConfig, SymbologyPreset, SymbologyStyle,
    mapbox_paint_for_config, VectorStylePack,
};
pub use native::{
    MapboxBridge as NativeMapboxBridge, MapCreateOptions, DEFAULT_BASEMAP_ID as NATIVE_DEFAULT_BASEMAP_ID,
    MAP_CONTAINER_ID,
};
