//! Map place search — Nominatim (Task 31.14).

use dioxus::prelude::*;

use crate::api::gis::geocode::GeocodeHit;

#[component]
pub fn MapSearchControl(
    open: bool,
    query: Signal<String>,
    hits: Signal<Vec<GeocodeHit>>,
    busy: Signal<bool>,
    on_toggle: EventHandler<()>,
    on_query_change: EventHandler<String>,
    on_search: EventHandler<()>,
    on_pick: EventHandler<(f64, f64, String)>,
) -> Element {
    rsx! {
        div { class: "gs-native-search-wrap",
            button {
                class: if open {
                    "gs-native-float-btn gs-native-float-btn--active"
                } else {
                    "gs-native-float-btn"
                },
                r#type: "button",
                title: "Search places",
                aria_label: "Search",
                aria_pressed: "{open}",
                onclick: move |_| on_toggle.call(()),
                i { class: "fa-solid fa-magnifying-glass", aria_hidden: "true" }
            }

            if open {
                div {
                    class: "gs-native-search-panel",
                    role: "search",
                    "data-testid": "map-search-panel",

                    input {
                        class: "gs-native-search-panel__input",
                        r#type: "search",
                        placeholder: "City, address…",
                        value: "{query()}",
                        oninput: move |e| on_query_change.call(e.value()),
                        onkeydown: move |e| {
                            if e.key() == Key::Enter {
                                on_search.call(());
                            }
                        },
                    }
                    button {
                        class: "gs-native-search-panel__btn",
                        r#type: "button",
                        disabled: busy(),
                        onclick: move |_| on_search.call(()),
                        if busy() { "…" } else { "Go" }
                    }

                    if !hits().is_empty() {
                        ul { class: "gs-native-search-panel__hits",
                            for (i, hit) in hits().iter().enumerate() {
                                {
                                    let lat = hit.lat.parse::<f64>().unwrap_or(0.0);
                                    let lon = hit.lon.parse::<f64>().unwrap_or(0.0);
                                    let label = hit.display_name.clone();
                                    rsx! {
                                        li { key: "{i}",
                                            button {
                                                class: "gs-native-search-panel__hit",
                                                r#type: "button",
                                                onclick: move |_| on_pick.call((lon, lat, label.clone())),
                                                "{hit.display_name}"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
