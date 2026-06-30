//! GeoSyntra map brand chrome — React `SiMapGeoSyntraBrand.tsx` (Task 32.1c).

use dioxus::prelude::*;

#[component]
pub fn MapGeoSyntraBrand() -> Element {
    rsx! {
        div {
            class: "gs-native-map-brand",
            aria_label: "GeoSyntra",
            span { class: "gs-native-map-brand__logo", "GeoSyntra" }
            span { class: "gs-native-map-brand__tag", "Satellite Intelligence" }
        }
    }
}
