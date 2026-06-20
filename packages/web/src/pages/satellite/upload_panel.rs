//! Upload staging panel — Task 32.3a.

use dioxus::prelude::*;

use crate::gis::{build_staging_datasets, UploadStagingDataset};

#[component]
pub fn UploadStagingPanel(datasets: Signal<Vec<UploadStagingDataset>>) -> Element {
    rsx! {
        div { class: "gs-native-upload-staging",
            p { class: "gs-native-tool-panel__label", "Staged uploads" }
            if datasets().is_empty() {
                p { class: "gs-native-tool-panel__empty", "Paste GeoJSON in Add data or stage files here." }
            } else {
                ul {
                    for ds in datasets().iter() {
                        li { key: "{ds.id}",
                            span { "{ds.name}" }
                            if ds.ready {
                                span { class: "gs-native-upload-ok", " ready" }
                            } else if let Some(w) = &ds.warning {
                                span { class: "gs-native-upload-warn", " — {w}" }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn stage_demo_files() -> Vec<UploadStagingDataset> {
    build_staging_datasets(&[
        ("field.geojson".into(), 4096),
        ("zones.shp".into(), 8192),
    ])
}
