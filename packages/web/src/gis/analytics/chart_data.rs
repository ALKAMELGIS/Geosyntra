//! Static AOI chart data — React `staticAoiMultiChartData.ts` (Task 32.10).

use super::weekly_stats::{chart_series_values, WeeklyCompositeStat};

#[derive(Debug, Clone, PartialEq)]
pub struct ChartLayerSeries {
    pub layer_id: String,
    pub label: String,
    pub values: Vec<f64>,
    pub dates: Vec<String>,
}

pub fn build_multi_layer_chart(
    index_id: &str,
    stats: &[WeeklyCompositeStat],
) -> ChartLayerSeries {
    ChartLayerSeries {
        layer_id: index_id.into(),
        label: index_id.into(),
        values: chart_series_values(stats),
        dates: stats.iter().map(|s| s.week_start.clone()).collect(),
    }
}

pub fn sparkline_norm(values: &[f64]) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }
    let min = values.iter().copied().fold(f64::INFINITY, f64::min);
    let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let span = (max - min).max(1e-9);
    values.iter().map(|v| (v - min) / span).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gis::analytics::weekly_stats::WeeklyCompositeStat;

    #[test]
    fn sparkline_normalized_0_to_1() {
        let norm = sparkline_norm(&[0.0, 0.5, 1.0]);
        assert!((norm[0] - 0.0).abs() < 1e-9);
        assert!((norm[2] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn builds_series_from_stats() {
        let stats = vec![WeeklyCompositeStat {
            week_start: "2026-01-01".into(),
            week_end: "2026-01-07".into(),
            mean: 0.4,
            min: 0.3,
            max: 0.5,
        }];
        let s = build_multi_layer_chart("NDVI", &stats);
        assert_eq!(s.values, vec![0.4]);
    }
}
