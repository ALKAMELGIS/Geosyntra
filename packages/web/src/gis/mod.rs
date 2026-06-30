//! GIS domain types and persistence.

mod analytics;
mod aoi;
mod aoi_geometry;
mod aoi_remote;
mod aoi_report;
mod aoi_report_pdf;
mod aoi_zonal_stats;
mod arcgis_layer;
mod export;
mod fields;
mod identify;
mod index_catalog;
mod layers;
mod remote_sensing;
mod routing;
pub mod sentinel;
mod stac;
mod symbology;
mod upload_staging;
mod weather_overlay;
pub mod parity;
pub mod native;

pub use aoi::{
    aoi_bounds, delete_aoi, list_aois, load_aoi_geojson_collection, save_aoi, upsert_aoi_from_geojson,
    AoiRecord,
};
pub use aoi_remote::{load_aois_for_session, persist_aoi, remove_aoi};
pub use analytics::{
    build_multi_layer_chart, chart_markers_geojson, chart_markers_paint, chart_series_values,
    normalize_weekly_stats, sparkline_norm, ChartLayerSeries, WeeklyCompositeStat,
    CHARTS_OVERLAY_LAYER_ID,
};
pub use aoi_geometry::{draw_mode_bridge_name, rename_aoi_properties, vertex_count, DrawMode};
pub use aoi_zonal_stats::{fetch_zonal_stats_for_aoi, zonal_stats_for_aoi, AoiZonalStatRow};
pub use arcgis_layer::{bounds_from_geojson, parse_arcgis_feature_layer_ref, query_geojson_url, ArcgisLayerRef};
pub use export::{build_geotiff_manifest, build_print_manifest, page_dimensions_mm, GeoTiffExportManifest, GeoTiffExportSpec, PrintManifest, PrintOrientation, PrintPageSpec};
pub use identify::{identify_at_point, IdentifyHit};
pub use routing::{
    la_haversine_km, solve_location_allocation, solve_vrp_greedy, LaAssignment, LaDemand, LaFacility,
    VrpRoute, VrpStop,
};
pub use stac::{demo_collections, search_items, StacCollection, StacItem, DEFAULT_STAC_API};
pub use upload_staging::{
    all_datasets_ready, build_staging_datasets, infer_kind, UploadKind, UploadStagingDataset,
};
pub use aoi_report::{
    build_aoi_vegetation_report, AoiVegetationReport, BuildReportInput, ChangeDetectionSlot,
    ReportIndexId, ReportTableRow, ReportTimePoint, TimelineWeekInput,
};
pub use aoi_report_pdf::{build_aoi_report_pdf, AoiReportPdf};
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
    build_weekly_timeline, crossfade_frames, legend_config_for_index, synthetic_zonal_analytics,
    wms_time_extent_for_week, wms_tile_url_for_index, wms_tile_url_for_index_at_time,
    wms_tile_url_simple, CrossfadeFrame, TimelineTransitionMode,
    TimelineWeek, WmsLegendConfig, WmsTimeExtent, ZonalAnalytics,
};
pub use layers::{AddedLayer, LayerKind, LayerSettings, LayerStore, INDEX_RASTER_LAYER_ID};
pub use weather_overlay::{
    weather_overlay_paint, weather_point_geojson, WEATHER_OVERLAY_LAYER_ID,
};
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
