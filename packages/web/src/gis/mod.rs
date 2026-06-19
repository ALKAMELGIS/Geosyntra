//! GIS domain types and persistence.

mod aoi;
mod aoi_remote;
mod fields;
mod layers;
pub mod native;

pub use aoi::{
    aoi_bounds, delete_aoi, list_aois, load_aoi_geojson_collection, save_aoi, upsert_aoi_from_geojson,
    AoiRecord,
};
pub use aoi_remote::{load_aois_for_session, persist_aoi, remove_aoi};
pub use fields::{load_fields, save_fields, FieldRecord};
pub use layers::{AddedLayer, LayerKind, LayerStore};
pub use native::{
    MapboxBridge as NativeMapboxBridge, MapCreateOptions, DEFAULT_BASEMAP_ID as NATIVE_DEFAULT_BASEMAP_ID,
    MAP_CONTAINER_ID,
};
