//! WMS legend config — React `siWmsLiveIndexLegendConfig.ts` (Task 32.5f).

use crate::gis::symbology::{stops_for_index, thin_legend_segments, WmsLegendSegment};

#[derive(Debug, Clone, PartialEq)]
pub struct WmsLegendConfig {
    pub index_id: String,
    pub label: String,
    pub segments: Vec<WmsLegendSegment>,
    pub band_count: usize,
}

pub fn legend_config_for_index(index_id: &str, band_count: usize) -> WmsLegendConfig {
    let stops = stops_for_index(index_id);
    let label = crate::gis::index_label_for(index_id).to_string();
    WmsLegendConfig {
        index_id: index_id.into(),
        label,
        segments: thin_legend_segments(&stops, band_count.max(1)),
        band_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ndvi_legend_has_segments() {
        let cfg = legend_config_for_index("NDVI", 5);
        assert_eq!(cfg.segments.len(), 5);
    }
}
