//! GIS analytics — charts / dashboard data (Task 32.10).

mod chart_data;
mod charts_map_overlay;
mod weekly_stats;

pub use chart_data::{build_multi_layer_chart, sparkline_norm, ChartLayerSeries};
pub use charts_map_overlay::{
    chart_markers_geojson, chart_markers_paint, CHARTS_OVERLAY_LAYER_ID,
};
pub use weekly_stats::{chart_series_values, normalize_weekly_stats, WeeklyCompositeStat};
