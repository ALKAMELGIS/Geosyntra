//! GIS domain types and persistence — Rust-only (Task 28).

mod aoi;
mod aoi_remote;
mod layers;
mod mapbox;

pub use aoi::{
    aoi_bounds, delete_aoi, list_aois, load_aoi_geojson_collection, save_aoi, upsert_aoi_from_geojson,
    AoiRecord,
};
pub use aoi_remote::{load_aois_for_session, persist_aoi, remove_aoi};
pub use layers::{AddedLayer, LayerKind, LayerStore};
pub use mapbox::{MapHandle, MapInitOptions, MapboxBridge, DrawMode};
