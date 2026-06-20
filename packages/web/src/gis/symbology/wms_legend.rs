//! WMS index classification legend — React `siWmsLegendClassStyle.ts` (Task 32.4f).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WmsRampStop {
    pub value: f64,
    pub color_hex: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WmsLegendSegment {
    pub from: f64,
    pub to: f64,
    pub color_hex: String,
    pub label: String,
}

pub fn ndvi_classification_stops() -> Vec<WmsRampStop> {
    vec![
        WmsRampStop { value: -0.2, color_hex: "#7f1d1d".into() },
        WmsRampStop { value: 0.0, color_hex: "#f97316".into() },
        WmsRampStop { value: 0.2, color_hex: "#eab308".into() },
        WmsRampStop { value: 0.4, color_hex: "#84cc16".into() },
        WmsRampStop { value: 0.6, color_hex: "#15803d".into() },
    ]
}

pub fn thin_legend_segments(stops: &[WmsRampStop], band_count: usize) -> Vec<WmsLegendSegment> {
    if stops.len() < 2 || band_count == 0 {
        return Vec::new();
    }
    (0..band_count)
        .map(|i| {
            let t0 = i as f64 / band_count as f64;
            let t1 = (i + 1) as f64 / band_count as f64;
            let idx0 = ((stops.len() - 1) as f64 * t0).floor() as usize;
            let idx1 = ((stops.len() - 1) as f64 * t1).ceil() as usize;
            let a = &stops[idx0.min(stops.len() - 1)];
            let b = &stops[idx1.min(stops.len() - 1)];
            WmsLegendSegment {
                from: a.value,
                to: b.value,
                color_hex: a.color_hex.clone(),
                label: format!("{:.2} – {:.2}", a.value, b.value),
            }
        })
        .collect()
}

pub fn stops_for_index(index_id: &str) -> Vec<WmsRampStop> {
    match index_id.to_ascii_uppercase().as_str() {
        "NDWI" => vec![
            WmsRampStop { value: -0.5, color_hex: "#1e3a8a".into() },
            WmsRampStop { value: 0.0, color_hex: "#38bdf8".into() },
            WmsRampStop { value: 0.5, color_hex: "#e0f2fe".into() },
        ],
        "LST" => vec![
            WmsRampStop { value: 15.0, color_hex: "#312e81".into() },
            WmsRampStop { value: 30.0, color_hex: "#22c55e".into() },
            WmsRampStop { value: 45.0, color_hex: "#ef4444".into() },
        ],
        _ => ndvi_classification_stops(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_five_ndvi_bands() {
        let segs = thin_legend_segments(&ndvi_classification_stops(), 5);
        assert_eq!(segs.len(), 5);
    }
}
