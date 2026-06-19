//! Left floating map controls — basemap, search, projection (Task 31.2 / 31.14).

use dioxus::prelude::*;

use super::{basemap_picker::BasemapGallery, map_search::MapSearchControl};
use crate::api::gis::geocode::GeocodeHit;

#[component]
pub fn MapFloatingControls(
    basemap_id: String,
    basemap_open: bool,
    globe_mode: bool,
    search_open: bool,
    search_query: Signal<String>,
    search_hits: Signal<Vec<GeocodeHit>>,
    search_busy: Signal<bool>,
    on_basemap_toggle: EventHandler<()>,
    on_basemap_select: EventHandler<String>,
    on_toggle_projection: EventHandler<()>,
    on_search_toggle: EventHandler<()>,
    on_search_query: EventHandler<String>,
    on_search: EventHandler<()>,
    on_search_pick: EventHandler<(f64, f64, String)>,
) -> Element {
    rsx! {
        div { class: "gs-native-float-left",
            MapSearchControl {
                open: search_open,
                query: search_query,
                hits: search_hits,
                busy: search_busy,
                on_toggle: on_search_toggle,
                on_query_change: on_search_query,
                on_search: on_search,
                on_pick: on_search_pick,
            }

            div { class: "gs-native-float-basemap-wrap",
                button {
                    class: if basemap_open {
                        "gs-native-float-btn gs-native-float-btn--active"
                    } else {
                        "gs-native-float-btn"
                    },
                    r#type: "button",
                    title: "Basemap gallery",
                    aria_label: "Basemap",
                    aria_pressed: "{basemap_open}",
                    onclick: move |_| on_basemap_toggle.call(()),
                    i { class: "fa-solid fa-image", aria_hidden: "true" }
                }

                if basemap_open {
                    div { class: "gs-native-float-basemap-panel",
                        BasemapGallery {
                            active_id: basemap_id,
                            on_select: on_basemap_select,
                        }
                    }
                }
            }

            button {
                class: if globe_mode {
                    "gs-native-float-btn gs-native-float-btn--active"
                } else {
                    "gs-native-float-btn"
                },
                r#type: "button",
                title: if globe_mode { "Switch to 2D map" } else { "Switch to 3D globe" },
                aria_label: "Toggle 2D / 3D",
                aria_pressed: "{globe_mode}",
                onclick: move |_| on_toggle_projection.call(()),
                i {
                    class: if globe_mode { "fa-solid fa-globe" } else { "fa-regular fa-map" },
                    aria_hidden: "true"
                }
            }
        }
    }
}
