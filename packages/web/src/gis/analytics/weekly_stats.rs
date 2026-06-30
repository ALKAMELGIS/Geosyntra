//! Weekly composite stats — React `weeklyCompositeStats.ts` (Task 32.10).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeeklyCompositeStat {
    pub week_start: String,
    pub week_end: String,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
}

pub fn normalize_weekly_stats(
    raw: &[(String, String, f64)],
    date_start: &str,
    date_end: &str,
) -> Vec<WeeklyCompositeStat> {
    raw.iter()
        .filter(|(s, e, _)| e.as_str() >= date_start && s.as_str() <= date_end)
        .map(|(s, e, mean)| {
            let spread = mean.abs() * 0.15 + 0.05;
            WeeklyCompositeStat {
                week_start: s.clone(),
                week_end: e.clone(),
                mean: *mean,
                min: mean - spread,
                max: mean + spread,
            }
        })
        .collect()
}

pub fn chart_series_values(stats: &[WeeklyCompositeStat]) -> Vec<f64> {
    stats.iter().map(|s| s.mean).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_by_range() {
        let raw = vec![
            ("2026-01-01".into(), "2026-01-07".into(), 0.4),
            ("2026-02-01".into(), "2026-02-07".into(), 0.5),
        ];
        let out = normalize_weekly_stats(&raw, "2026-01-01", "2026-01-31");
        assert_eq!(out.len(), 1);
    }
}
