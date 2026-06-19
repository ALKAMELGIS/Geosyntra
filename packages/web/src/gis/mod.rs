//! GIS domain types and persistence.

mod aoi;
mod aoi_remote;
mod basemap_catalog;
mod layers;
mod leaflet_map;
pub mod native;

pub use aoi::{
    aoi_bounds, delete_aoi, list_aois, load_aoi_geojson_collection, save_aoi, upsert_aoi_from_geojson,
    AoiRecord,
};
pub use aoi_remote::{load_aois_for_session, persist_aoi, remove_aoi};
pub use basemap_catalog::{
    basemap_thumbnail_url, build_basemap_catalog, catalog_entry_by_id, esri_basemap_entries,
    resolve_basemap_id, resolve_startup_basemap_id, BasemapEntry, DEFAULT_BASEMAP_ID,
    QUICK_BASEMAP_PRESETS,
};
pub use layers::{AddedLayer, LayerKind, LayerStore};
pub use leaflet_map::{DrawMode, LeafletBridge, MapHandle, MapInitOptions};
pub use native::{
    MapboxBridge as NativeMapboxBridge, MapCreateOptions, DEFAULT_BASEMAP_ID as NATIVE_DEFAULT_BASEMAP_ID,
    MAP_CONTAINER_ID,
};
