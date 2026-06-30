use dioxus::prelude::*;

use crate::{
    components::settings::SettingsShell,
    gis_content_store::find_row,
    routes::Route,
};

#[component]
pub fn SettingsGisContentItem(item_id: String) -> Element {
    let row = find_row(&item_id);

    rsx! {
        SettingsShell {
            div { class: "gs-settings-page",
                Link {
                    to: Route::SettingsGisContent {},
                    class: "gs-btn gs-btn--ghost",
                    "← Content portal"
                }
                if let Some(row) = row {
                    h1 { class: "gs-page-title", "{row.title}" }
                    div { class: "gs-card",
                        dl { class: "gs-dl",
                            dt { "Type" }
                            dd { "{row.type_label}" }
                            dt { "Modified" }
                            dd { "{row.modified}" }
                            dt { "Sharing" }
                            dd { "{row.sharing}" }
                            dt { "Folder" }
                            dd { code { "{row.folder_id}" } }
                            dt { "Item ID" }
                            dd { code { "{row.id}" } }
                        }
                        p { class: "gs-hint",
                            "Full item editor (symbology, layers, dashboard builder) remains in the satellite workspace."
                        }
                        Link {
                            to: Route::SatelliteIndices {},
                            class: "gs-btn gs-btn--primary",
                            "Open in GeoAI workspace"
                        }
                    }
                } else {
                    h1 { class: "gs-page-title", "Item not found" }
                    p { class: "gs-hint", "This content item is missing or was deleted." }
                }
            }
        }
    }
}
