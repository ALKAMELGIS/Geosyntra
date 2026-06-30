//! AOI vegetation report model — React `siAoiVegetationReportModel.ts` subset (Task 32.6d).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::gis::aoi_bounds;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum ReportIndexId {
    #[default]
    Ndvi,
    Ndwi,
    Savi,
    Lst,
}

impl ReportIndexId {
    pub fn label(self) -> &'static str {
        match self {
            Self::Ndvi => "NDVI",
            Self::Ndwi => "NDWI",
            Self::Savi => "SAVI",
            Self::Lst => "Land Surface Temperature",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReportTimePoint {
    pub date: String,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReportTableRow {
    pub key: String,
    pub label: String,
    pub pct: f64,
    pub area_km2: f64,
    pub color_hex: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChangeDetectionSlot {
    pub date: String,
    pub index_mean: f64,
    pub high_pct: f64,
    pub med_pct: f64,
    pub low_pct: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AoiVegetationReport {
    pub index_id: ReportIndexId,
    pub index_label: String,
    pub aoi_name: String,
    pub date_start: String,
    pub date_end: String,
    pub aoi_area_km2: f64,
    pub summary_lines: Vec<String>,
    pub analysis: String,
    pub time_series: Vec<ReportTimePoint>,
    pub table_rows: Vec<ReportTableRow>,
    pub change_detection_slots: Vec<ChangeDetectionSlot>,
    pub heatmap_geojson: Value,
    pub aoi_outline_geojson: Value,
}

#[derive(Debug, Clone)]
pub struct BuildReportInput<'a> {
    pub index_id: ReportIndexId,
    pub date_start: &'a str,
    pub date_end: &'a str,
    pub aoi_name: &'a str,
    pub aoi_feature: &'a Value,
    pub weekly: &'a [TimelineWeekInput],
}

#[derive(Debug, Clone)]
pub struct TimelineWeekInput {
    pub start_date: String,
    pub end_date: String,
    pub mean: f64,
}

pub fn build_aoi_vegetation_report(input: &BuildReportInput<'_>) -> Option<AoiVegetationReport> {
    let geom = input.aoi_feature.get("geometry")?;
    let gtype = geom.get("type")?.as_str()?;
    if gtype != "Polygon" && gtype != "MultiPolygon" {
        return None;
    }

    let bounds = aoi_bounds(input.aoi_feature)?;
    let area_km2 = approximate_area_km2(bounds);
    let weeks = overlapping_weeks(input.weekly, input.date_start, input.date_end);
    let weeks = if weeks.is_empty() {
        synthetic_weeks(input.date_start, input.date_end, 12)
    } else {
        weeks
    };

    let aoi_key = serde_json::to_string(geom).unwrap_or_default();
    let time_series: Vec<ReportTimePoint> = weeks
        .iter()
        .enumerate()
        .map(|(i, w)| ReportTimePoint {
            date: w.start_date.clone(),
            value: synthetic_index_value(input.index_id, i, weeks.len(), &aoi_key, w.mean),
        })
        .collect();

    let mean = time_series.iter().map(|t| t.value).sum::<f64>() / time_series.len().max(1) as f64;
    let table_rows = legend_band_rows(input.index_id, area_km2, 5);
    let change_detection_slots = build_change_slots(&time_series);

    let summary = vec![
        format!(
            "{} analysis for {} ({:.2} km²)",
            input.index_id.label(),
            input.aoi_name,
            area_km2
        ),
        format!(
            "Period {} → {} · mean index {:.3}",
            input.date_start, input.date_end, mean
        ),
    ];

    Some(AoiVegetationReport {
        index_id: input.index_id,
        index_label: input.index_id.label().into(),
        aoi_name: input.aoi_name.into(),
        date_start: input.date_start.into(),
        date_end: input.date_end.into(),
        aoi_area_km2: area_km2,
        summary_lines: summary.clone(),
        analysis: format!(
            "Vegetation index mean {:.3} over {} weeks (client synthetic — STAC/API hook reserved).",
            mean,
            time_series.len()
        ),
        time_series,
        table_rows,
        change_detection_slots,
        heatmap_geojson: build_heatmap_grid(input.aoi_feature, bounds, &aoi_key),
        aoi_outline_geojson: json!({
            "type": "FeatureCollection",
            "features": [input.aoi_feature.clone()],
        }),
    })
}

fn approximate_area_km2(bounds: [f64; 4]) -> f64 {
    let [w, s, e, n] = bounds;
    let lat_mid = (s + n) / 2.0;
    let dx = (e - w).abs() * 111.0 * lat_mid.to_radians().cos();
    let dy = (n - s).abs() * 111.0;
    (dx * dy).max(0.001)
}

fn overlapping_weeks(
    weekly: &[TimelineWeekInput],
    start: &str,
    end: &str,
) -> Vec<TimelineWeekInput> {
    weekly
        .iter()
        .filter(|w| w.end_date.as_str() >= start && w.start_date.as_str() <= end)
        .cloned()
        .collect()
}

fn synthetic_weeks(start: &str, end: &str, max: usize) -> Vec<TimelineWeekInput> {
    let start_key = parse_iso_key(start);
    let end_key = parse_iso_key(end);
    if start_key == 0 || end_key == 0 || end_key < start_key {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut cursor = start_key;
    let mut i = 0usize;
    while cursor <= end_key && i < max {
        let week_end = (cursor + 6).min(end_key);
        let t = (cursor - start_key) as f64 / ((end_key - start_key).max(1) as f64);
        out.push(TimelineWeekInput {
            start_date: format_iso(cursor),
            end_date: format_iso(week_end),
            mean: 0.35 + 0.25 * (t * std::f64::consts::PI * 2.0).sin(),
        });
        cursor = week_end + 1;
        i += 1;
    }
    out
}

fn synthetic_index_value(
    index: ReportIndexId,
    week_i: usize,
    n: usize,
    aoi_key: &str,
    base_mean: f64,
) -> f64 {
    let seed = hash_str(&format!("{aoi_key}|{week_i}")) as f64 / 10_000.0;
    let base = match index {
        ReportIndexId::Ndvi | ReportIndexId::Savi => 0.35 + base_mean * 0.4,
        ReportIndexId::Ndwi => 0.15 + base_mean * 0.25,
        ReportIndexId::Lst => 28.0 + base_mean * 8.0,
    };
    let wave = (week_i as f64 / n.max(1) as f64) * std::f64::consts::PI;
    base + seed * 0.08 + wave.sin() * 0.05
}

fn legend_band_rows(index: ReportIndexId, area_km2: f64, bands: usize) -> Vec<ReportTableRow> {
    let colors = match index {
        ReportIndexId::Ndwi => ["#1e3a8a", "#2563eb", "#38bdf8", "#7dd3fc", "#e0f2fe"],
        ReportIndexId::Lst => ["#312e81", "#4338ca", "#22c55e", "#f97316", "#ef4444"],
        _ => ["#7f1d1d", "#f97316", "#eab308", "#84cc16", "#15803d"],
    };
    let pct_each = 100.0 / bands as f64;
    (0..bands)
        .map(|i| ReportTableRow {
            key: format!("lb{i}"),
            label: format!("Class {}", i + 1),
            pct: pct_each,
            area_km2: area_km2 * pct_each / 100.0,
            color_hex: colors[i.min(colors.len() - 1)].into(),
        })
        .collect()
}

fn build_change_slots(series: &[ReportTimePoint]) -> Vec<ChangeDetectionSlot> {
    let dates: Vec<String> = if series.is_empty() {
        (0..12).map(|_| "—".into()).collect()
    } else {
        let n = series.len();
        (0..12)
            .map(|i| {
                let idx = ((i as f64 / 11.0) * (n - 1) as f64).round() as usize;
                series[idx.min(n - 1)].date.clone()
            })
            .collect()
    };
    dates
        .into_iter()
        .map(|date| {
            let val = series
                .iter()
                .find(|t| t.date == date)
                .map(|t| t.value)
                .unwrap_or(0.4);
            ChangeDetectionSlot {
                date,
                index_mean: val,
                high_pct: 33.0,
                med_pct: 34.0,
                low_pct: 33.0,
            }
        })
        .collect()
}

fn build_heatmap_grid(feature: &Value, bounds: [f64; 4], seed: &str) -> Value {
    let [w, s, e, n] = bounds;
    let nx = 8usize;
    let ny = 8usize;
    let dx = (e - w) / nx as f64;
    let dy = (n - s) / ny as f64;
    let mut features = Vec::new();
    for i in 0..nx {
        for j in 0..ny {
            let cx = w + (i as f64 + 0.5) * dx;
            let cy = s + (j as f64 + 0.5) * dy;
            let h = hash_str(&format!("{seed}|{cx:.4}|{cy:.4}"));
            let size = dx.min(dy) * 0.85;
            features.push(json!({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [cx - size/2.0, cy - size/2.0],
                        [cx + size/2.0, cy - size/2.0],
                        [cx + size/2.0, cy + size/2.0],
                        [cx - size/2.0, cy + size/2.0],
                        [cx - size/2.0, cy - size/2.0],
                    ]]
                },
                "properties": { "class": h % 5, "opacity": 0.55 }
            }));
        }
    }
    let _ = feature;
    json!({ "type": "FeatureCollection", "features": features })
}

fn hash_str(s: &str) -> u32 {
    s.bytes().fold(0u32, |h, b| h.wrapping_mul(31).wrapping_add(u32::from(b)))
}

fn parse_iso_key(s: &str) -> i64 {
    let s = s.trim();
    if s.len() < 10 {
        return 0;
    }
    let y: i64 = s[0..4].parse().unwrap_or(0);
    let m: i64 = s[5..7].parse().unwrap_or(0);
    let d: i64 = s[8..10].parse().unwrap_or(0);
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
    use serde_json::json;

    #[test]
    fn builds_report_for_polygon_aoi() {
        let feature = json!({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[53.0, 22.0], [54.0, 22.0], [54.0, 23.0], [53.0, 22.0]]]
            },
            "properties": {}
        });
        let report = build_aoi_vegetation_report(&BuildReportInput {
            index_id: ReportIndexId::Ndvi,
            date_start: "2026-01-01",
            date_end: "2026-01-31",
            aoi_name: "Test AOI",
            aoi_feature: &feature,
            weekly: &[],
        })
        .expect("report");
        assert_eq!(report.aoi_name, "Test AOI");
        assert!(!report.time_series.is_empty());
        assert_eq!(report.change_detection_slots.len(), 12);
    }
}
