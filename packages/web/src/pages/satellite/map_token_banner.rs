//! Mapbox token / status banner — React `SiMapMapboxStatusBanner.tsx` (Task 32.1d).

use dioxus::prelude::*;

use crate::gis::native::{is_gl_init_placeholder, GL_INIT_PLACEHOLDER};

#[component]
pub fn MapTokenStatusBanner(token: String, map_ready: bool) -> Element {
    if map_ready && !is_gl_init_placeholder(&token) {
        return rsx! {};
    }
    let msg = if is_gl_init_placeholder(&token) {
        format!(
            "Using placeholder Mapbox token ({GL_INIT_PLACEHOLDER}) — Esri/OSM tiles only; configure pk.* for full GL features."
        )
    } else if !map_ready {
        "Initializing 3D globe…".into()
    } else {
        return rsx! {};
    };
    rsx! {
        div { class: "gs-gis-banner gs-gis-banner--info", role: "status",
            "{msg}"
        }
    }
}
