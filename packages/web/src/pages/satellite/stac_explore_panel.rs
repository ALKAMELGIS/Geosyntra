//! STAC explore panel — Task 32.3d.

use dioxus::prelude::*;

use crate::gis::{demo_collections, search_items, StacCollection, StacItem};

#[component]
pub fn StacExplorePanel(
    collection: Signal<String>,
    items: Signal<Vec<StacItem>>,
    on_search: EventHandler<()>,
) -> Element {
    rsx! {
        div { class: "gs-native-stac-panel",
            p { class: "gs-native-tool-panel__hint",
                "Search Planetary Computer STAC collections and preview scenes."
            }
            label { class: "gs-native-tool-panel__label",
                "Collection"
                select {
                    value: "{collection()}",
                    onchange: move |e| collection.set(e.value()),
                    for col in demo_collections() {
                        option {
                            value: "{col.id}",
                            selected: col.id == collection(),
                            "{col.title}"
                        }
                    }
                }
            }
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                onclick: move |_| on_search.call(()),
                "Search items"
            }
            ul { class: "gs-native-stac-list",
                for item in items().iter() {
                    li { key: "{item.id}",
                        span { class: "gs-native-stac-item-id", "{item.id}" }
                        span { class: "gs-native-stac-item-date", "{item.datetime}" }
                    }
                }
            }
        }
    }
}

pub fn run_stac_search(collection_id: &str) -> Vec<StacItem> {
    search_items(collection_id, None, 8)
}

pub fn default_collection() -> StacCollection {
    demo_collections().into_iter().next().unwrap_or(StacCollection {
        id: "sentinel-2-l2a".into(),
        title: "Sentinel-2".into(),
        description: String::new(),
    })
}
