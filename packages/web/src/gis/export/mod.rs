//! GIS export — print / GeoTIFF (Task 32.11).

mod print_pdf;

pub use print_pdf::{
    build_print_manifest, page_dimensions_mm, PrintManifest, PrintOrientation, PrintPage,
    PrintPageSpec,
};
