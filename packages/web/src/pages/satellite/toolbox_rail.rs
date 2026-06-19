//! Map toolbox rail — Task 31.2 (React `SatelliteContextualAnalysisDock` parity).

use dioxus::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ToolboxTool {
    pub id: &'static str,
    pub icon: &'static str,
    pub label: &'static str,
    pub title: &'static str,
}

pub const TOOLBOX_TOOLS: &[ToolboxTool] = &[
    ToolboxTool {
        id: "add-data",
        icon: "fa-solid fa-plus",
        label: "Add data",
        title: "Add data (Phase 8)",
    },
    ToolboxTool {
        id: "layers",
        icon: "fa-solid fa-layer-group",
        label: "Layers",
        title: "Layer settings (Phase 3)",
    },
    ToolboxTool {
        id: "remote-sensing",
        icon: "fa-solid fa-satellite-dish",
        label: "Remote sensing",
        title: "Indices, WMS, timeline (Phase 6)",
    },
    ToolboxTool {
        id: "geo-ai",
        icon: "fa-solid fa-comments",
        label: "Agent Chat",
        title: "Geo AI (Phase 10)",
    },
    ToolboxTool {
        id: "fields",
        icon: "fa-solid fa-vector-square",
        label: "Fields",
        title: "Fields data (Phase 15)",
    },
    ToolboxTool {
        id: "aoi",
        icon: "fa-solid fa-draw-polygon",
        label: "AOI",
        title: "Draw AOI (Phase 5)",
    },
    ToolboxTool {
        id: "charts",
        icon: "fa-solid fa-chart-column",
        label: "Charts",
        title: "Charts (Phase 9)",
    },
    ToolboxTool {
        id: "stats",
        icon: "fa-solid fa-chart-pie",
        label: "Statistics",
        title: "Statistics (Phase 9)",
    },
    ToolboxTool {
        id: "weather",
        icon: "fa-solid fa-cloud-sun",
        label: "Weather",
        title: "Weather (Phase 12)",
    },
    ToolboxTool {
        id: "imagery",
        icon: "fa-solid fa-image",
        label: "Imagery",
        title: "Raster controls (Phase 6)",
    },
    ToolboxTool {
        id: "identify",
        icon: "fa-solid fa-circle-info",
        label: "Identify",
        title: "Feature info (Phase 7)",
    },
    ToolboxTool {
        id: "route",
        icon: "fa-solid fa-route",
        label: "Route",
        title: "Routing (Phase 11)",
    },
    ToolboxTool {
        id: "measure",
        icon: "fa-solid fa-ruler",
        label: "Measure",
        title: "Measure (Phase 7)",
    },
    ToolboxTool {
        id: "print",
        icon: "fa-solid fa-print",
        label: "Print",
        title: "Print export (Phase 13)",
    },
];

#[component]
pub fn ToolboxRail(active_tool: String, on_select: EventHandler<String>) -> Element {
    rsx! {
        aside {
            class: "gs-native-toolbox-rail",
            role: "toolbar",
            aria_label: "Map analysis toolbox",

            div { class: "gs-native-toolbox-rail__brand",
                i { class: "fa-solid fa-globe", aria_hidden: "true" }
            }

            div { class: "gs-native-toolbox-rail__scroll",
                for tool in TOOLBOX_TOOLS.iter() {
                    {
                        let id = tool.id.to_string();
                        let pressed = active_tool == tool.id;
                        rsx! {
                            button {
                                key: "{tool.id}",
                                class: if pressed {
                                    "gs-native-toolbox-rail__btn gs-native-toolbox-rail__btn--active"
                                } else {
                                    "gs-native-toolbox-rail__btn"
                                },
                                r#type: "button",
                                title: "{tool.title}",
                                aria_label: "{tool.label}",
                                aria_pressed: "{pressed}",
                                onclick: move |_| on_select.call(id.clone()),
                                i { class: "{tool.icon}", aria_hidden: "true" }
                            }
                        }
                    }
                }
            }
        }
    }
}
