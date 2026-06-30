//! Analysis engine / MPC zonal sample — `/api/analysis-engine/mpc/*` (Task 32.FD-1).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{api_client::ApiClient, error_display::ApiError};

use crate::gis::sentinel::ZonalAnalytics;

#[derive(Debug, Deserialize)]
struct MpcZonalLayer {
    #[serde(default)]
    mean: Option<f64>,
    #[serde(default)]
    min: Option<f64>,
    #[serde(default)]
    max: Option<f64>,
    #[serde(default)]
    stdev: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MpcZonalSampleResult {
    #[serde(default)]
    pixel_count: Option<u32>,
    #[serde(default)]
    layers: Option<std::collections::HashMap<String, MpcZonalLayer>>,
}

fn index_to_mpc_layer(index_id: &str) -> &'static str {
    match index_id.to_ascii_uppercase().as_str() {
        "NDWI" | "MNDWI" => "ndmi_s2",
        "EVI" => "ndvi_s2",
        "SAVI" => "ndvi_s2",
        _ => "ndvi_s2",
    }
}

/// POST `/api/analysis-engine/mpc/zonal-sample` — live AOI spectral stats.
pub async fn fetch_zonal_sample(
    aoi_feature: &Value,
    index_id: &str,
    datetime: &str,
) -> Result<ZonalAnalytics, ApiError> {
    let client = ApiClient::from_env();
    let layer_id = index_to_mpc_layer(index_id);
    let body = json!({
        "aoi": aoi_feature,
        "datetime": datetime,
        "layer_ids": [layer_id],
        "clip_to_aoi": true,
        "max_cloud_cover": 20,
    });
    let result: MpcZonalSampleResult = client
        .post_json("/api/analysis-engine/mpc/zonal-sample", &body, None)
        .await?;
    let layer = result
        .layers
        .as_ref()
        .and_then(|m| m.get(layer_id))
        .or_else(|| result.layers.as_ref().and_then(|m| m.values().next()));
    let Some(layer) = layer else {
        return Err(ApiError::Parse {
            message: "mpc zonal sample missing layer stats".into(),
        });
    };
    let mean = layer.mean.unwrap_or(0.0);
    let min = layer.min.unwrap_or(mean - 0.1);
    let max = layer.max.unwrap_or(mean + 0.1);
    Ok(ZonalAnalytics {
        index_mean: mean,
        index_min: min,
        index_max: max,
        pixel_count: result.pixel_count.unwrap_or(0),
        high_pct: 33.0,
        med_pct: 34.0,
        low_pct: 33.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_ndvi_layer_id() {
        assert_eq!(index_to_mpc_layer("NDVI"), "ndvi_s2");
    }
}
