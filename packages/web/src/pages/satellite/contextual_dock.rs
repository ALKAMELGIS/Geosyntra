//! Contextual analysis dock — React `SatelliteContextualAnalysisDock.tsx` (Task 32.2a).

use dioxus::prelude::*;

pub const CONTEXTUAL_PANEL_IDS: &[&str] = &[
    "layers",
    "remote-sensing",
    "legend",
    "route",
    "elev-profile",
    "daylight",
    "weather",
    "explore-indexes",
    "quick-dashboard",
    "charts",
    "identify",
];

#[component]
pub fn ContextualDockHint(active_tool: String) -> Element {
    let label = CONTEXTUAL_PANEL_IDS
        .iter()
        .find(|id| **id == active_tool)
        .map(|s| (*s).replace('-', " "))
        .unwrap_or_else(|| "map".into());
    rsx! {
        p { class: "gs-native-contextual-hint",
            "Context: {label}"
        }
    }
}
