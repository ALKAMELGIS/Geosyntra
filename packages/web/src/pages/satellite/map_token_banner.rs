//! Mapbox token / status banner — React `SiMapMapboxStatusBanner.tsx` (Task 32.1d).

use dioxus::prelude::*;

use crate::gis::native::{is_gl_init_placeholder, GL_INIT_PLACEHOLDER};

#[component]
pub fn MapTokenStatusBanner(
    token: String,
    map_ready: bool,
    mapbox_configured: bool,
    mapbox_proxy_mode: bool,
    has_public_token: bool,
) -> Element {
    // React: proxy-only or public pk — no end-user banner.
    if mapbox_configured && (has_public_token || mapbox_proxy_mode) {
        return rsx! {};
    }
    if map_ready && !is_gl_init_placeholder(&token) {
        return rsx! {};
    }
    let msg = if is_gl_init_placeholder(&token) {
        format!(
            "Mapbox token missing on API — Esri basemap active ({GL_INIT_PLACEHOLDER} GL init only)."
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
