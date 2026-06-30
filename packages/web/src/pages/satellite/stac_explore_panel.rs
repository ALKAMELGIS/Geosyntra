//! STAC explore panel — Task 32.3d (live Planetary Computer catalog).

use dioxus::prelude::*;

use crate::api::gis::stac::{fetch_collections, search_items_live};
use crate::gis::{demo_collections, StacCollection, StacItem};

#[component]
pub fn StacExplorePanel(
    collection: Signal<String>,
    items: Signal<Vec<StacItem>>,
    bbox: Option<[f64; 4]>,
    on_add_to_map: Option<EventHandler<StacItem>>,
) -> Element {
    let mut collections = use_signal(|| demo_collections());
    let mut busy = use_signal(|| false);
    let mut error = use_signal(|| None::<String>);

    use_future(move || async move {
        match fetch_collections().await {
            Ok(live) if !live.is_empty() => collections.set(live),
            Ok(_) => {}
            Err(_) => {}
        }
    });

    let bbox = bbox;
    rsx! {
        div { class: "gs-native-stac-panel",
            p { class: "gs-native-tool-panel__hint",
                "Search Planetary Computer STAC collections and preview scenes."
            }
            if let Some(msg) = error() {
                p { class: "gs-native-tool-panel__error", "{msg}" }
            }
            label { class: "gs-native-tool-panel__label",
                "Collection"
                select {
                    value: "{collection()}",
                    onchange: move |e| collection.set(e.value()),
                    for col in collections().iter() {
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
                disabled: busy(),
                onclick: move |_| {
                    busy.set(true);
                    let cid = collection();
                    let bbox_copy = bbox;
                    spawn(async move {
                        match search_items_live(&cid, bbox_copy, 12).await {
                            Ok(found) => items.set(found),
                            Err(err) => error.set(Some(err.user_message())),
                        }
                        busy.set(false);
                    });
                },
                if busy() { "Searching…" } else { "Search items" }
            }
            ul { class: "gs-native-stac-list",
                for item in items().iter() {
                    li { key: "{item.id}",
                        span { class: "gs-native-stac-item-id", "{item.id}" }
                        span { class: "gs-native-stac-item-date", "{item.datetime}" }
                        if let Some(on_add) = on_add_to_map {
                            button {
                                class: "gs-native-tool-panel__btn gs-native-tool-panel__btn--ghost",
                                r#type: "button",
                                onclick: {
                                    let item = item.clone();
                                    move |_| on_add.call(item.clone())
                                },
                                "Add to map"
                            }
                        }
                    }
                }
            }
        }
    }
}
