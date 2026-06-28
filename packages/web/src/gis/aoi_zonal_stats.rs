//! AOI zonal stats — React `siAoiZonalStats.ts` (Task 32.6 / FD-1).

use serde_json::Value;

use crate::api::gis::analysis_engine::fetch_zonal_sample;

use super::sentinel::{synthetic_zonal_analytics, ZonalAnalytics};

#[derive(Debug, Clone, PartialEq)]
pub struct AoiZonalStatRow {
    pub index_id: String,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
    pub area_km2: f64,
}

fn row_from_zonal(index_id: &str, z: &ZonalAnalytics, area_km2: f64) -> AoiZonalStatRow {
    AoiZonalStatRow {
        index_id: index_id.into(),
        mean: z.index_mean,
        min: z.index_min,
        max: z.index_max,
        area_km2,
    }
}

pub fn zonal_stats_for_aoi(
    index_ids: &[&str],
    aoi_key: &str,
    area_km2: f64,
) -> Vec<AoiZonalStatRow> {
    index_ids
        .iter()
        .map(|id| {
            let z = synthetic_zonal_analytics(id, aoi_key);
            row_from_zonal(id, &z, area_km2)
        })
        .collect()
}

/// Live MPC zonal sample when analysis engine is reachable; synthetic fallback otherwise.
pub async fn fetch_zonal_stats_for_aoi(
    index_ids: &[&str],
    aoi_key: &str,
    aoi_feature: &Value,
    area_km2: f64,
    datetime: &str,
) -> Vec<AoiZonalStatRow> {
    let mut rows = Vec::new();
    for id in index_ids {
        let z = match fetch_zonal_sample(aoi_feature, id, datetime).await {
            Ok(z) => z,
            Err(_) => synthetic_zonal_analytics(id, aoi_key),
        };
        rows.push(row_from_zonal(id, &z, area_km2));
    }
    rows
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
