//! Native Mapbox GIS — fresh Task 31 implementation (not Task 29 Leaflet).

mod basemap;
mod camera;
mod daylight;
mod geo_stats;
mod measure;
mod mapbox_bridge;
mod mapbox_token;
mod terrain_basemap;

pub use basemap::{
    catalog_entries, resolve_basemap_id, style_for_basemap, BasemapEntry, BasemapPreset,
    DEFAULT_BASEMAP_ID, QUICK_PRESETS,
};
pub use daylight::{
    clamp_minutes, format_date_display, mapbox_light_for_minutes, minutes_to_hhmm,
    DaylightSettings, DAYLIGHT_MINUTES_MAX,
};
pub use terrain_basemap::{
    merge_terrain_underlay, style_for_terrain_basemap, TERRAIN_BASEMAP_ID,
};
pub use camera::{
    GLOBE_HOME_LAT, GLOBE_HOME_LNG, GLOBE_HOME_ZOOM, PROJECTION_GLOBE, PROJECTION_MERCATOR,
};
pub use mapbox_bridge::{MapboxBridge, MapCreateOptions, MapHandle, MapViewState, MAP_CONTAINER_ID};
pub use measure::{haversine_km, line_length_km};
pub use geo_stats::polygon_area_km2;
pub use mapbox_token::{is_gl_init_placeholder, resolve_gl_access_token, GL_INIT_PLACEHOLDER};
