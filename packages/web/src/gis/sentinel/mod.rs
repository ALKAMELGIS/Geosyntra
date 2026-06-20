//! Sentinel Hub OGC WMS — TIME, MAXCC, GEOMETRY, EVALSCRIPT (Task 32.5a).

mod aoi_clip;
mod timeline;
mod wms_url;

pub use aoi_clip::{clip_from_geojson, AoiClipResult};
pub use timeline::{
    build_weekly_timeline, resolve_timeline_series_extents, wms_time_extent_for_week, TimelineWeek,
    TimelineSeriesExtents,
};
pub use wms_url::{
    build_wms_tile_url, default_wms_base_url, uses_max_cloud_cover, WmsTileUrlParams,
    WmsTimeExtent, SENTINEL_HUB_PUBLIC_INSTANCE_ID,
};

use crate::gis::index_catalog::resolve_index_id;

/// Mapbox raster template URL for the active index layer.
pub fn wms_tile_url_for_index(
    index_id: &str,
    settings: &crate::gis::RemoteSensingSettings,
    aoi_geojson: Option<&serde_json::Value>,
    timeline_active: bool,
) -> String {
    let layer = resolve_index_id(index_id);
    let time = if timeline_active {
        WmsTimeExtent {
            start: settings.time_series_start.clone(),
            end: settings.time_series_end.clone(),
        }
    } else {
        let day = settings.imagery_date.clone();
        WmsTimeExtent {
            start: day.clone(),
            end: day,
        }
    };
    let clip = aoi_geojson.and_then(clip_from_geojson);
    build_wms_tile_url(WmsTileUrlParams {
        base_url: default_wms_base_url(None),
        logical_layer_id: layer,
        tile_layer_name: layer,
        time,
        cloud_cover: 20,
        clip: clip.as_ref(),
    })
}

/// Back-compat demo template (no TIME/AOI) for tests.
pub fn wms_tile_url_simple(index_id: &str) -> String {
    wms_tile_url_for_index(
        index_id,
        &crate::gis::RemoteSensingSettings::default(),
        None,
        false,
    )
}
