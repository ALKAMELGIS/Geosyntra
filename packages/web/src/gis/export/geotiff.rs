//! GeoTIFF RGB export manifest (Task 32.FD-10).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeoTiffExportSpec {
    pub layer_id: String,
    pub width_px: u32,
    pub height_px: u32,
    pub bbox: [f64; 4],
    pub crs: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeoTiffExportManifest {
    pub spec: GeoTiffExportSpec,
    pub ready: bool,
    pub note: String,
}

pub fn build_geotiff_manifest(spec: &GeoTiffExportSpec) -> GeoTiffExportManifest {
    GeoTiffExportManifest {
        spec: spec.clone(),
        ready: spec.width_px > 0 && spec.height_px > 0,
        note: "Export queued — raster tiles composited server-side when Sentinel credentials are configured.".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_ready_when_dimensions_set() {
        let spec = GeoTiffExportSpec {
            layer_id: "NDVI".into(),
            width_px: 512,
            height_px: 512,
            bbox: [0.0, 0.0, 1.0, 1.0],
            crs: "EPSG:4326".into(),
        };
        assert!(build_geotiff_manifest(&spec).ready);
    }
}
