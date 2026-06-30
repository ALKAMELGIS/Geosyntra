use dioxus::prelude::*;

use crate::routes::Route;

#[component]
pub fn Multidimensional() -> Element {
    rsx! {
        div { class: "gs-app gs-main",
            div { class: "gs-settings-page",
                Link { to: Route::SatelliteIndices {}, class: "gs-btn gs-btn--ghost", "← GeoAI workspace" }
                h1 { class: "gs-page-title", "Multidimensional analysis" }
                p { class: "gs-page-lead",
                    "Time-series cubes, climate stacks, and multi-band composites — coming soon."
                }
                p { class: "gs-hint",
                    "Use the GeoAI workspace indices and remote sensing panels for current analysis workflows."
                }
                Link {
                    to: Route::SatelliteIndices {},
                    class: "gs-btn gs-btn--primary",
                    "Open GeoAI workspace"
                }
            }
        }
    }
}
