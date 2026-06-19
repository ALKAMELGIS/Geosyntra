//! Basemap gallery — Task 31.1 (Esri-first, React `SiBasemapWidget` subset).

use dioxus::prelude::*;

use crate::gis::native::{catalog_entries, resolve_basemap_id, BasemapPreset, QUICK_PRESETS};

#[component]
pub fn BasemapGallery(active_id: String, on_select: EventHandler<String>) -> Element {
    rsx! {
        div {
            class: "gs-native-basemap-gallery",
            role: "listbox",
            aria_label: "Basemap gallery",

            div { class: "gs-native-basemap-gallery__header",
                span { "Basemap" }
            }

            div { class: "gs-native-basemap-gallery__quick",
                for preset in QUICK_PRESETS.iter() {
                    BasemapQuickBtn {
                        key: "{preset.id}",
                        preset: preset.clone(),
                        active: active_id == preset.id,
                        on_select: move |id| on_select.call(id),
                    }
                }
            }

            div { class: "gs-native-basemap-gallery__list",
                for entry in catalog_entries() {
                    {
                        let id = entry.id.clone();
                        let active = active_id == entry.id;
                        rsx! {
                            button {
                                key: "{entry.id}",
                                class: if active {
                                    "gs-native-basemap-gallery__item gs-native-basemap-gallery__item--active"
                                } else {
                                    "gs-native-basemap-gallery__item"
                                },
                                r#type: "button",
                                role: "option",
                                aria_selected: "{active}",
                                onclick: move |_| on_select.call(id.clone()),
                                "{entry.label}"
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn BasemapQuickBtn(
    preset: BasemapPreset,
    active: bool,
    on_select: EventHandler<String>,
) -> Element {
    let id = preset.id.to_string();
    rsx! {
        button {
            class: if active {
                "gs-native-basemap-gallery__quick-btn gs-native-basemap-gallery__quick-btn--active"
            } else {
                "gs-native-basemap-gallery__quick-btn"
            },
            r#type: "button",
            title: "{preset.label}",
            aria_label: "{preset.label}",
            aria_pressed: "{active}",
            onclick: move |_| on_select.call(id.clone()),
            "{preset.label}"
        }
    }
}

pub fn normalize_basemap_id(id: &str) -> String {
    resolve_basemap_id(id).to_string()
}
