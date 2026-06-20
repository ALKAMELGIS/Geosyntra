//! GIS analytics — charts / dashboard data (Task 32.10).

mod chart_data;
mod weekly_stats;

pub use chart_data::{build_multi_layer_chart, sparkline_norm, ChartLayerSeries};
pub use weekly_stats::{chart_series_values, normalize_weekly_stats, WeeklyCompositeStat};
