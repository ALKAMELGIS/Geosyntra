//! GIS export — print / GeoTIFF (Task 32.11).

mod geotiff;
mod print_pdf;

pub use geotiff::{build_geotiff_manifest, GeoTiffExportManifest, GeoTiffExportSpec};
pub use print_pdf::{
    build_print_manifest, page_dimensions_mm, PrintManifest, PrintOrientation, PrintPage,
    PrintPageSpec,
};
