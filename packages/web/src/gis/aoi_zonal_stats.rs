//! AOI zonal stats — React `siAoiZonalStats.ts` (Task 32.6).

use serde::{Deserialize, Serialize};

use super::sentinel::ZonalAnalytics;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AoiZonalStatRow {
    pub index_id: String,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
    pub area_km2: f64,
}

pub fn zonal_stats_for_aoi(
    index_ids: &[&str],
    aoi_key: &str,
    area_km2: f64,
) -> Vec<AoiZonalStatRow> {
    index_ids
        .iter()
        .map(|id| {
            let z = super::sentinel::synthetic_zonal_analytics(id, aoi_key);
            AoiZonalStatRow {
                index_id: (*id).into(),
                mean: z.index_mean,
                min: z.index_min,
                max: z.index_max,
                area_km2,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_row_per_index() {
        let rows = zonal_stats_for_aoi(&["NDVI", "NDWI"], "k", 1.0);
        assert_eq!(rows.len(), 2);
    }
}
