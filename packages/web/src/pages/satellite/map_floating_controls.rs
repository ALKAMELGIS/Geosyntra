//! Left floating map controls — basemap, search, projection (Task 31.2).

use dioxus::prelude::*;

use super::basemap_picker::BasemapGallery;

#[component]
pub fn MapFloatingControls(
    basemap_id: String,
    basemap_open: bool,
    globe_mode: bool,
    on_basemap_toggle: EventHandler<()>,
    on_basemap_select: EventHandler<String>,
    on_toggle_projection: EventHandler<()>,
) -> Element {
    rsx! {
        div { class: "gs-native-float-left",
            button {
                class: "gs-native-float-btn",
                r#type: "button",
                title: "Search places (Phase 14)",
                aria_label: "Search",
                disabled: true,
                i { class: "fa-solid fa-magnifying-glass", aria_hidden: "true" }
            }

            button {
                class: "gs-native-float-btn",
                r#type: "button",
                title: "Apps (Phase 10)",
                aria_label: "Apps",
                disabled: true,
                i { class: "fa-solid fa-grip", aria_hidden: "true" }
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
                class: "gs-native-float-btn",
                r#type: "button",
                title: "Weather (Phase 12)",
                aria_label: "Weather",
                disabled: true,
                i { class: "fa-solid fa-cloud-sun", aria_hidden: "true" }
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
