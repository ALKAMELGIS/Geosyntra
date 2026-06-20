//! Print / PDF export helpers — React `SiMapPrintModal.tsx` subset (Task 32.11).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PrintPageSpec {
    pub title: String,
    pub orientation: PrintOrientation,
    pub dpi: u16,
    pub include_legend: bool,
    pub include_north_arrow: bool,
    pub include_scale_bar: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PrintOrientation {
    #[default]
    Landscape,
    Portrait,
}

impl Default for PrintPageSpec {
    fn default() -> Self {
        Self {
            title: "GeoSyntra map export".into(),
            orientation: PrintOrientation::Landscape,
            dpi: 150,
            include_legend: true,
            include_north_arrow: true,
            include_scale_bar: true,
        }
    }
}

pub fn page_dimensions_mm(spec: &PrintPageSpec) -> (f64, f64) {
    match spec.orientation {
        PrintOrientation::Landscape => (297.0, 210.0),
        PrintOrientation::Portrait => (210.0, 297.0),
    }
}

pub fn build_print_manifest(spec: &PrintPageSpec, map_png_data_url: Option<&str>) -> PrintManifest {
    PrintManifest {
        title: spec.title.clone(),
        pages: vec![PrintPage {
            label: "Map".into(),
            has_image: map_png_data_url.is_some(),
        }],
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PrintManifest {
    pub title: String,
    pub pages: Vec<PrintPage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PrintPage {
    pub label: String,
    pub has_image: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landscape_a4_dimensions() {
        let (w, h) = page_dimensions_mm(&PrintPageSpec::default());
        assert!((w - 297.0).abs() < 1e-9);
        assert!((h - 210.0).abs() < 1e-9);
    }
}
