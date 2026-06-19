use dioxus::prelude::*;

use super::native_workspace::NativeSatelliteWorkspace;
use crate::routes::Route;

/// `/satellite` → `/satellite/indices` (Task 31 native GIS).
#[component]
pub fn Satellite() -> Element {
    let nav = use_navigator();
    use_effect(move || {
        let _ = nav.replace(Route::SatelliteIndices {});
    });
    rsx! {
        div { class: "gs-gis-loading", "Opening GeoAI workspace…" }
    }
}

/// Native Mapbox workspace at `/satellite/indices` (Task 31 — no React iframe).
#[component]
pub fn SatelliteIndices() -> Element {
    rsx! {
        NativeSatelliteWorkspace {}
    }
}
