//! Timeline week index — React `siTimelineWeekIndex.ts` subset (Task 32.5a).

use super::wms_url::WmsTimeExtent;

#[derive(Debug, Clone, PartialEq)]
pub struct TimelineWeek {
    pub week_index: usize,
    pub start_date: String,
    pub end_date: String,
    pub mean: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimelineSeriesExtents {
    pub start_iso: String,
    pub end_iso: String,
    pub focus_iso: String,
    pub last_week_end_iso: String,
}

/// Build ISO week buckets between start and end (inclusive), ~7-day steps.
pub fn build_weekly_timeline(start_iso: &str, end_iso: &str) -> Vec<TimelineWeek> {
    let start = parse_iso(start_iso);
    let end = parse_iso(end_iso);
    if start > end {
        return Vec::new();
    }
    let mut weeks = Vec::new();
    let mut cursor = start;
    let mut idx = 0usize;
    while cursor <= end {
        let week_end = (cursor + 6).min(end);
        weeks.push(TimelineWeek {
            week_index: idx,
            start_date: format_iso(cursor),
            end_date: format_iso(week_end),
            mean: 0.5,
        });
        cursor = week_end + 1;
        idx += 1;
    }
    weeks
}

pub fn resolve_timeline_series_extents(
    weeks: &[TimelineWeek],
    panel_start: &str,
    panel_end: &str,
) -> TimelineSeriesExtents {
    if weeks.is_empty() {
        let start_iso: String = panel_start.trim().chars().take(10).collect();
        let end_iso: String = panel_end.trim().chars().take(10).collect();
        let focus_iso = if end_iso.is_empty() {
            start_iso.clone()
        } else {
            end_iso.clone()
        };
        return TimelineSeriesExtents {
            start_iso,
            end_iso: end_iso.clone(),
            focus_iso,
            last_week_end_iso: end_iso,
        };
    }
    let start_iso = weeks.first().map(|w| w.start_date.clone()).unwrap_or_default();
    let last_week_end_iso = weeks.last().map(|w| w.end_date.clone()).unwrap_or_default();
    let panel_end = panel_end.trim().chars().take(10).collect::<String>();
    let end_iso = if panel_end.is_empty() {
        last_week_end_iso.clone()
    } else {
        panel_end
    };
    TimelineSeriesExtents {
        start_iso,
        end_iso: end_iso.clone(),
        focus_iso: end_iso,
        last_week_end_iso,
    }
}

pub fn wms_time_extent_for_week(week: &TimelineWeek, focus_iso: Option<&str>) -> WmsTimeExtent {
    let focus = focus_iso
        .map(|s| s.trim().chars().take(10).collect::<String>())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| week.end_date.clone());
    let start = if focus < week.start_date {
        week.start_date.clone()
    } else if focus > week.end_date {
        week.end_date.clone()
    } else {
        focus.clone()
    };
    WmsTimeExtent {
        start: start.clone(),
        end: focus,
    }
}

fn parse_iso(s: &str) -> i64 {
    let s = s.trim();
    if s.len() < 10 {
        return 0;
    }
    let y: i64 = s[0..4].parse().unwrap_or(2026);
    let m: i64 = s[5..7].parse().unwrap_or(1);
    let d: i64 = s[8..10].parse().unwrap_or(1);
    y * 10_000 + m * 100 + d
}

fn format_iso(key: i64) -> String {
    let y = key / 10_000;
    let m = (key / 100) % 100;
    let d = key % 100;
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_weeks_in_range() {
        let weeks = build_weekly_timeline("2026-01-01", "2026-01-20");
        assert!(!weeks.is_empty());
        assert_eq!(weeks[0].start_date, "2026-01-01");
    }

    #[test]
    fn wms_time_clamps_to_week() {
        let week = TimelineWeek {
            week_index: 0,
            start_date: "2026-01-01".into(),
            end_date: "2026-01-07".into(),
            mean: 0.4,
        };
        let ext = wms_time_extent_for_week(&week, Some("2026-01-05"));
        assert_eq!(ext.start, "2026-01-05");
        assert_eq!(ext.end, "2026-01-05");
    }
}
