//! Native Mapbox GIS — fresh Task 31 implementation (not Task 29 Leaflet).

mod basemap;
mod camera;
mod geo_stats;
mod mapbox_bridge;
mod mapbox_token;

pub use basemap::{
    catalog_entries, resolve_basemap_id, style_for_basemap, BasemapEntry, BasemapPreset,
    DEFAULT_BASEMAP_ID, QUICK_PRESETS,
};
pub use camera::{
    GLOBE_HOME_LAT, GLOBE_HOME_LNG, GLOBE_HOME_ZOOM, PROJECTION_GLOBE, PROJECTION_MERCATOR,
};
pub use mapbox_bridge::{MapboxBridge, MapCreateOptions, MapHandle, MapViewState, MAP_CONTAINER_ID};
pub use geo_stats::polygon_area_km2;
pub use mapbox_token::{is_gl_init_placeholder, resolve_gl_access_token, GL_INIT_PLACEHOLDER};
