use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

use crate::routes::Route;

const STORAGE_KEY: &str = "fertigation_records_v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct FertigationEntry {
    id: u64,
    site: String,
    project: String,
    block: String,
    date: String,
    time: String,
    #[serde(default)]
    fertilizer_type: String,
    #[serde(default)]
    flow_rate: String,
    #[serde(default)]
    status: String,
}

fn load_records() -> Vec<FertigationEntry> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(STORAGE_KEY) {
                    if let Ok(rows) = serde_json::from_str(&raw) {
                        return rows;
                    }
                }
            }
        }
    }
    Vec::new()
}

fn save_records(rows: &[FertigationEntry]) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Ok(json) = serde_json::to_string(rows) {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item(STORAGE_KEY, &json);
                }
            }
        }
    }
    let _ = rows;
}

#[component]
pub fn FertigationRecords() -> Element {
    let mut records = use_signal(load_records);
    let mut site = use_signal(String::new);
    let mut project = use_signal(String::new);
    let mut block = use_signal(String::new);
    let mut date = use_signal(|| "2026-06-17".to_string());
    let mut fertilizer = use_signal(String::new);

    let add_record = move |_| {
        if site.read().trim().is_empty() || project.read().trim().is_empty() {
            return;
        }
        let mut next = records.read().clone();
        next.push(FertigationEntry {
            id: crate::wall_clock::now_ms() as u64,
            site: site.read().clone(),
            project: project.read().clone(),
            block: block.read().clone(),
            date: date.read().clone(),
            time: "08:00".into(),
            fertilizer_type: fertilizer.read().clone(),
            flow_rate: String::new(),
            status: "Planned".into(),
        });
        save_records(&next);
        records.set(next);
        site.set(String::new());
        project.set(String::new());
        block.set(String::new());
        fertilizer.set(String::new());
    };

    rsx! {
        div { class: "gs-app gs-main",
            div { class: "gs-settings-page",
                Link { to: Route::Dashboard {}, class: "gs-btn gs-btn--ghost", "← Dashboard" }
                h1 { class: "gs-page-title", "Fertigation records" }
                p { class: "gs-page-lead", "Local field fertigation log (browser storage)." }

                div { class: "gs-card",
                    h2 { class: "gs-card-title", "New entry" }
                    div { class: "gs-inline-actions",
                        input { placeholder: "Site", value: "{site}", oninput: move |e| site.set(e.value()) }
                        input { placeholder: "Project", value: "{project}", oninput: move |e| project.set(e.value()) }
                        input { placeholder: "Block", value: "{block}", oninput: move |e| block.set(e.value()) }
                        input { r#type: "date", value: "{date}", oninput: move |e| date.set(e.value()) }
                        input { placeholder: "Fertilizer", value: "{fertilizer}", oninput: move |e| fertilizer.set(e.value()) }
                        button { class: "gs-btn gs-btn--primary", onclick: add_record, "Add" }
                    }
                }

                div { class: "gs-table-wrap",
                    table { class: "gs-table",
                        thead {
                            tr {
                                th { "Date" }
                                th { "Site" }
                                th { "Project" }
                                th { "Block" }
                                th { "Fertilizer" }
                                th { "Status" }
                            }
                        }
                        tbody {
                            for row in records.read().iter().cloned() {
                                tr { key: "{row.id}",
                                    td { "{row.date}" }
                                    td { "{row.site}" }
                                    td { "{row.project}" }
                                    td { "{row.block}" }
                                    td { "{row.fertilizer_type}" }
                                    td { "{row.status}" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
