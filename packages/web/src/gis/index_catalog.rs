//! Remote sensing index catalog — aligned with React `siLayerLiveCompositeCatalog` / `LAYER_LIVE_INDEX_CODES`.

pub const DEFAULT_INDEX_ID: &str = "NDVI";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexLayerDef {
    pub id: &'static str,
    pub label: &'static str,
}

/// Standard spectral indices for Layer live picker (React `LAYER_LIVE_INDEX_CODES`).
pub fn catalog() -> &'static [IndexLayerDef] {
    const CATALOG: &[IndexLayerDef] = &[
        IndexLayerDef { id: "NDVI", label: "NDVI" },
        IndexLayerDef { id: "NDMI", label: "NDMI" },
        IndexLayerDef { id: "NDWI", label: "NDWI" },
        IndexLayerDef { id: "EVI", label: "EVI" },
        IndexLayerDef { id: "SAVI", label: "SAVI" },
        IndexLayerDef { id: "GNDVI", label: "GNDVI" },
        IndexLayerDef { id: "NDSI", label: "NDSI" },
        IndexLayerDef { id: "NDRE", label: "NDRE" },
        IndexLayerDef { id: "LST", label: "LST" },
        IndexLayerDef { id: "NDBI", label: "NDBI" },
        IndexLayerDef { id: "MNDWI", label: "MNDWI" },
    ];
    CATALOG
}

pub fn resolve_index_id(id: &str) -> &str {
    let upper = id.trim().to_uppercase();
    if catalog().iter().any(|e| e.id == upper.as_str()) {
        return catalog()
            .iter()
            .find(|e| e.id == upper.as_str())
            .map(|e| e.id)
            .unwrap_or(DEFAULT_INDEX_ID);
    }
    DEFAULT_INDEX_ID
}

pub fn label_for(id: &str) -> String {
    let rid = resolve_index_id(id);
    catalog()
        .iter()
        .find(|e| e.id == rid)
        .map(|e| e.label.to_string())
        .unwrap_or_else(|| rid.to_string())
}

/// Demo WMS tile template — same pattern as React Sentinel Hub OGC placeholder.
pub fn wms_tile_url(index_id: &str) -> String {
    let layer = resolve_index_id(index_id);
    format!(
        "https://services.sentinel-hub.com/ogc/wms/example?SERVICE=WMS&REQUEST=GetMap&LAYERS={layer}&FORMAT=image/png&TRANSPARENT=true&VERSION=1.3.0&STYLES=&CRS=EPSG:3857&BBOX={{bbox-epsg-3857}}&WIDTH=256&HEIGHT=256"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_savi() {
        assert_eq!(resolve_index_id("savi"), "SAVI");
        assert_eq!(label_for("SAVI"), "SAVI");
    }

    #[test]
    fn wms_url_includes_layer_code() {
        assert!(wms_tile_url("SAVI").contains("LAYERS=SAVI"));
    }
}
