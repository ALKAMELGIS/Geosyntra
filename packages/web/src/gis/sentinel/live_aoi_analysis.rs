//! Live AOI spectral analysis — React `useLiveAoiSpectralAnalysis.ts` (Task 32.5e).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LiveAnalysisStatus {
    #[default]
    Idle,
    Loading,
    Ready,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ZonalAnalytics {
    pub index_mean: f64,
    pub index_min: f64,
    pub index_max: f64,
    pub pixel_count: u32,
    pub high_pct: f64,
    pub med_pct: f64,
    pub low_pct: f64,
}

pub fn synthetic_zonal_analytics(index_id: &str, aoi_key: &str) -> ZonalAnalytics {
    let seed = aoi_key.bytes().fold(0u32, |h, b| h.wrapping_mul(31).wrapping_add(u32::from(b)));
    let base = match index_id.to_ascii_uppercase().as_str() {
        "NDWI" => 0.18,
        "LST" => 28.0,
        _ => 0.42,
    };
    let jitter = (seed % 100) as f64 / 1000.0;
    ZonalAnalytics {
        index_mean: base + jitter,
        index_min: base - 0.12,
        index_max: base + 0.15,
        pixel_count: 1200 + seed % 800,
        high_pct: 33.0,
        med_pct: 34.0,
        low_pct: 33.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_stats_finite() {
        let z = synthetic_zonal_analytics("NDVI", "aoi-1");
        assert!(z.index_mean.is_finite());
    }
}
