//! On-map chart marker overlay (Task 32.FD-9).

use serde_json::{json, Value};

use super::WeeklyCompositeStat;

pub const CHARTS_OVERLAY_LAYER_ID: &str = "charts-overlay";

pub fn chart_markers_geojson(centroid: [f64; 2], stats: &[WeeklyCompositeStat], index_id: &str) -> Value {
    let features: Vec<Value> = stats
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let offset = (i as f64 - stats.len() as f64 / 2.0) * 0.002;
            json!({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [centroid[0] + offset, centroid[1]]
                },
                "properties": {
                    "week": row.week_start,
                    "mean": row.mean,
                    "index_id": index_id,
                }
            })
        })
        .collect();
    json!({ "type": "FeatureCollection", "features": features })
}

pub fn chart_markers_paint() -> Value {
    json!({
        "circle-color": [
            "interpolate", ["linear"], ["get", "mean"],
            0.0, "#ef4444",
            0.5, "#eab308",
            1.0, "#22c55e"
        ],
        "circle-radius": 8,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff"
    })
}
