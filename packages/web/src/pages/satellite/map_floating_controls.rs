//! Left floating map controls — React `si-map-floating-controls__left` parity.

use dioxus::prelude::*;

use super::{basemap_picker::BasemapGallery, floating_drag::{DraggableFloat, FloatSlot}, map_search::MapSearchControl};
use crate::api::gis::geocode::GeocodeHit;

#[component]
pub fn MapFloatingControls(
    basemap_id: String,
    basemap_open: bool,
    globe_mode: bool,
    index_visible: bool,
    weather_open: bool,
    weather_intel_active: bool,
    swipe_active: bool,
    search_open: bool,
    search_query: Signal<String>,
    search_hits: Signal<Vec<GeocodeHit>>,
    search_busy: Signal<bool>,
    on_basemap_toggle: EventHandler<()>,
    on_basemap_select: EventHandler<String>,
    on_toggle_projection: EventHandler<()>,
    on_toggle_index: EventHandler<()>,
    on_toggle_weather: EventHandler<()>,
    on_toggle_weather_intel: EventHandler<()>,
    on_toggle_swipe: EventHandler<()>,
    on_open_remote_sensing: EventHandler<()>,
    on_search_toggle: EventHandler<()>,
    on_search_query: EventHandler<String>,
    on_search: EventHandler<()>,
    on_search_pick: EventHandler<(f64, f64, String)>,
    visible: bool,
    on_close: EventHandler<()>,
) -> Element {
    if !visible {
        return rsx! {};
    }

    rsx! {
        DraggableFloat {
            storage_key: "float-left-rail".to_string(),
            slot: FloatSlot::MapControls,
            class: "gs-native-float-left".to_string(),
            title: Some("Map tools".into()),
            on_close: Some(on_close),

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
                    i { class: "fa-solid fa-globe", aria_hidden: "true" }
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
                class: if index_visible {
                    "gs-native-float-btn gs-native-float-btn--active"
                } else {
                    "gs-native-float-btn"
                },
                r#type: "button",
                title: "Layer Live — toggle index imagery on map",
                aria_label: "Layer Live index imagery",
                aria_pressed: "{index_visible}",
                onclick: move |_| on_toggle_index.call(()),
                i { class: "fa-regular fa-image", aria_hidden: "true" }
            }

            button {
                class: if weather_open {
                    "gs-native-float-btn gs-native-float-btn--active"
                } else {
                    "gs-native-float-btn"
                },
                r#type: "button",
                title: "Weather visualization",
                aria_label: "Weather visualization",
                aria_pressed: "{weather_open}",
                onclick: move |_| on_toggle_weather.call(()),
                i { class: "fa-solid fa-cloud-sun", aria_hidden: "true" }
            }

            button {
                class: if weather_intel_active {
                    "gs-native-float-btn gs-native-float-btn--active"
                } else {
                    "gs-native-float-btn"
                },
                r#type: "button",
                title: "Weather intelligence — Open-Meteo at map point",
                aria_label: "Weather intelligence",
                aria_pressed: "{weather_intel_active}",
                onclick: move |_| on_toggle_weather_intel.call(()),
                i { class: "fa-solid fa-temperature-half", aria_hidden: "true" }
            }

            button {
                class: "gs-native-float-btn",
                r#type: "button",
                title: "Crop Health Intelligence — NDVI & field analysis",
                aria_label: "Crop Health Intelligence",
                onclick: move |_| on_open_remote_sensing.call(()),
                i { class: "fa-solid fa-seedling", aria_hidden: "true" }
            }

            button {
                class: if swipe_active {
                    "gs-native-float-btn gs-native-float-btn--active"
                } else {
                    "gs-native-float-btn"
                },
                r#type: "button",
                title: if swipe_active { "Close layer swipe" } else { "Layer swipe — compare two layers" },
                aria_label: "Layer swipe tool",
                aria_pressed: "{swipe_active}",
                onclick: move |_| on_toggle_swipe.call(()),
                i { class: "fa-solid fa-arrows-left-right-to-line", aria_hidden: "true" }
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
