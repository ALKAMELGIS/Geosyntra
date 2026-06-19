use dioxus::prelude::*;

use crate::{
    components::settings::SettingsShell,
    gis_content_store::{load_rows, save_rows, GisContentRow},
    routes::Route,
};

#[component]
pub fn SettingsGisContent() -> Element {
    let mut rows = use_signal(load_rows);
    let mut search = use_signal(String::new);
    let mut new_title = use_signal(String::new);

    let filtered: Vec<GisContentRow> = rows
        .read()
        .iter()
        .cloned()
        .filter(|row| {
            let q = search.read().trim().to_ascii_lowercase();
            q.is_empty()
                || row.title.to_ascii_lowercase().contains(&q)
                || row.type_label.to_ascii_lowercase().contains(&q)
        })
        .collect();

    let add_item = move |_| {
        let title = new_title.read().trim().to_string();
        if title.is_empty() {
            return;
        }
        let mut next = rows.read().clone();
        let id = format!("custom-{}", crate::wall_clock::now_ms());
        next.push(GisContentRow {
            id: id.clone(),
            title,
            type_label: "Web Map".into(),
            modified: "today".into(),
            folder_id: "all".into(),
            sharing: "private".into(),
        });
        save_rows(&next);
        rows.set(next);
        new_title.set(String::new());
    };

    rsx! {
        SettingsShell {
            div { class: "gs-settings-page",
                h1 { class: "gs-page-title", "GIS content" }
                p { class: "gs-page-lead",
                    "Content portal — maps, layers, and dashboards for your organization."
                }

                div { class: "gs-inline-actions",
                    input {
                        placeholder: "Search content…",
                        value: "{search}",
                        oninput: move |e| search.set(e.value()),
                    }
                    input {
                        placeholder: "New item title…",
                        value: "{new_title}",
                        oninput: move |e| new_title.set(e.value()),
                    }
                    button {
                        class: "gs-btn gs-btn--primary",
                        onclick: add_item,
                        "Add item"
                    }
                }

                div { class: "gs-table-wrap",
                    table { class: "gs-table",
                        thead {
                            tr {
                                th { "Title" }
                                th { "Type" }
                                th { "Modified" }
                                th { "Sharing" }
                                th { "" }
                            }
                        }
                        tbody {
                            for row in filtered {
                                tr { key: "{row.id}",
                                    td { "{row.title}" }
                                    td { "{row.type_label}" }
                                    td { "{row.modified}" }
                                    td { "{row.sharing}" }
                                    td {
                                        Link {
                                            to: Route::SettingsGisContentItem { item_id: row.id.clone() },
                                            class: "gs-btn gs-btn--ghost",
                                            "Open"
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
