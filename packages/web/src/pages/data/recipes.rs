use dioxus::prelude::*;
use serde_json::Value;

use crate::routes::Route;

const RECIPE_KEYS: &[&str] = &[
    "ecph_records_v1",
    "irrigation_scheduling_records_v1",
    "harvest_logging_records_v1",
    "production_tracking_records_v1",
    "qhis_records_v1",
];

fn load_recipe_rows(form_slug: &str) -> Vec<Value> {
    let key = match form_slug {
        "ecph" => "ecph_records_v1",
        "irrigation" => "irrigation_scheduling_records_v1",
        "harvest" => "harvest_logging_records_v1",
        "production" => "production_tracking_records_v1",
        "qhis" => "qhis_records_v1",
        other => other,
    };
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(key) {
                    if let Ok(rows) = serde_json::from_str::<Vec<Value>>(&raw) {
                        return rows;
                    }
                }
            }
        }
    }
    let _ = RECIPE_KEYS;
    Vec::new()
}

#[component]
pub fn Recipes(form_slug: String) -> Element {
    let rows = load_recipe_rows(&form_slug);

    rsx! {
        div { class: "gs-app gs-main",
            div { class: "gs-settings-page",
                Link { to: Route::Dashboard {}, class: "gs-btn gs-btn--ghost", "← Dashboard" }
                h1 { class: "gs-page-title", "Recipe: {form_slug}" }
                p { class: "gs-page-lead", "Data entry rows stored in local browser storage." }

                if rows.is_empty() {
                    p { class: "gs-hint", "No records found for storage key derived from this slug." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "#" }
                                    th { "Payload" }
                                }
                            }
                            tbody {
                                for (idx, row) in rows.iter().enumerate() {
                                    tr { key: "{idx}",
                                        td { "{idx + 1}" }
                                        td {
                                            code { "{row.to_string()}" }
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
