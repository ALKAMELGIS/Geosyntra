use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

use crate::routes::Route;

const STORAGE_KEY: &str = "agri_system_settings_v1";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CustomPage {
    pub path: String,
    pub title: String,
    #[serde(default, rename = "bindTarget")]
    pub bind_target: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
struct SystemSettings {
    #[serde(default, rename = "customPages")]
    custom_pages: Vec<CustomPage>,
}

pub fn load_custom_pages() -> Vec<CustomPage> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(STORAGE_KEY) {
                    if let Ok(settings) = serde_json::from_str::<SystemSettings>(&raw) {
                        return settings.custom_pages;
                    }
                }
            }
        }
    }
    Vec::new()
}

#[component]
pub fn DynamicBindPage(bind_target: String, title: Option<String>) -> Element {
    let nav = use_navigator();
    let target = bind_target.to_ascii_lowercase();
    let heading = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| bind_target.clone());

    use_effect({
        move || {
            match target.as_str() {
                "gis" | "satellite-indices" | "satellite" => {
                    let _ = nav.replace(Route::SatelliteIndices {});
                }
                "dashboards-overview" | "dashboard" => {
                    let _ = nav.replace(Route::Dashboard {});
                }
                _ => {}
            }
        }
    });

    rsx! {
        div { class: "gs-app gs-main",
            div { class: "gs-settings-page",
                h1 { class: "gs-page-title", "{heading}" }
                p { class: "gs-page-lead",
                    "Custom admin page bound to `{bind_target}`."
                }
                p { class: "gs-hint",
                    "Configure custom pages in system settings (`agri_system_settings_v1`)."
                }
            }
        }
    }
}
