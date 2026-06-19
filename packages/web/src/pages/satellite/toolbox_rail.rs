//! Map toolbox rail — React `si-lux-tb-shell` / `si-sat-ctx-rail` parity (Task 31.2).

use dioxus::prelude::*;

#[derive(Debug, Clone, Copy)]
struct RailTool {
    id: &'static str,
    icon: &'static str,
    label: &'static str,
    title: &'static str,
}

const PRIMARY_TOOLS: &[RailTool] = &[
    RailTool {
        id: "add-data",
        icon: "fa-solid fa-plus",
        label: "Add data",
        title: "Add data — upload, import, or connect a new layer to the map",
    },
    RailTool {
        id: "layers",
        icon: "fa-solid fa-layer-group",
        label: "Layers",
        title: "Layer settings",
    },
    RailTool {
        id: "remote-sensing",
        icon: "fa-solid fa-satellite-dish",
        label: "Remote sensing",
        title: "Remote sensing — Indices, WMS layers, timeline, and AOI tools.",
    },
];

const ANALYSIS_TOOLS: &[RailTool] = &[
    RailTool {
        id: "legend",
        icon: "fa-solid fa-book-atlas",
        label: "Legend",
        title: "Show legend — WMS / RGB layer symbology on map",
    },
    RailTool {
        id: "route",
        icon: "fa-solid fa-map-signs",
        label: "Route",
        title: "Route Map — street routing",
    },
    RailTool {
        id: "elev-profile",
        icon: "fa-solid fa-chart-area",
        label: "Elev profile",
        title: "Elevation profile — draw a line on the map",
    },
    RailTool {
        id: "weather",
        icon: "fa-solid fa-temperature-half",
        label: "Weather",
        title: "Weather intelligence — Open-Meteo at click or feature",
    },
];

const INTELLIGENCE_TOOLS: &[RailTool] = &[
    RailTool {
        id: "explore-indexes",
        icon: "fa-solid fa-puzzle-piece",
        label: "Explore Indexes",
        title: "Explore Indexes — spectral band cards for Layer Live",
    },
    RailTool {
        id: "quick-dashboard",
        icon: "fa-solid fa-chart-line",
        label: "Quick Dashboard",
        title: "Quick Dashboard — instant layer analytics",
    },
];

#[component]
pub fn ToolboxRail(
    active_tool: String,
    toolbox_pinned: bool,
    on_pin: EventHandler<bool>,
    on_select: EventHandler<String>,
) -> Element {
    let geo_ai_on = active_tool == "geo-ai";
    let symbology_on = active_tool == "symbology";
    let print_on = active_tool == "print";
    let mut analysis_open = use_signal(|| true);
    let mut intelligence_open = use_signal(|| false);

    let analysis_on = analysis_open();
    let intel_on = intelligence_open();

    rsx! {
        nav {
            class: "gs-native-toolbox-rail",
            role: "navigation",
            aria_label: "Map toolbox",
            "data-toolbox-density": "icons",

                div { class: "gs-native-lux-tb-pin-wrap",
                    button {
                        class: if toolbox_pinned {
                            "gs-native-lux-tb-pin gs-native-lux-tb-pin--on"
                        } else {
                            "gs-native-lux-tb-pin"
                        },
                        r#type: "button",
                        title: if toolbox_pinned { "Unpin map toolbox" } else { "Pin map toolbox" },
                        aria_label: if toolbox_pinned { "Unpin map toolbox" } else { "Pin map toolbox" },
                        aria_pressed: "{toolbox_pinned}",
                        onclick: move |_| on_pin.call(!toolbox_pinned),
                        i { class: "fa-solid fa-thumbtack", aria_hidden: "true" }
                    }
                }

                div { class: "gs-native-toolbox-rail__scroll",
                    for tool in PRIMARY_TOOLS.iter() {
                        { rail_btn(tool, &active_tool, on_select) }
                    }

                    div { class: "gs-native-toolbox-rail__sep", role: "separator", aria_hidden: "true" }

                    button {
                        class: if active_tool == "geo-ai" {
                            "gs-native-toolbox-rail__btn gs-native-toolbox-rail__btn--active gs-native-toolbox-rail__btn--agent"
                        } else {
                            "gs-native-toolbox-rail__btn gs-native-toolbox-rail__btn--agent"
                        },
                        r#type: "button",
                        title: "Agent Chat — Spatial copilot, attributes, and SQL-style prompts.",
                        aria_label: "Agent Chat",
                        aria_pressed: "{geo_ai_on}",
                        onclick: move |_| on_select.call("geo-ai".into()),
                        AgentChatRailIcon {}
                    }

                    div {
                        class: "gs-native-toolbox-rail__sym-wrap",
                        role: "group",
                        aria_label: "Map tools",

                        button {
                            class: if symbology_on {
                                "gs-native-toolbox-rail__sym-tool gs-native-toolbox-rail__sym-tool--on"
                            } else {
                                "gs-native-toolbox-rail__sym-tool"
                            },
                            r#type: "button",
                            title: "Symbology — classified layer colors",
                            aria_label: "Open symbology",
                            aria_pressed: "{symbology_on}",
                            onclick: move |_| on_select.call("symbology".into()),
                            i { class: "fa-solid fa-palette", aria_hidden: "true" }
                        }
                    }

                    button {
                        class: if analysis_on {
                            "gs-native-lux-tb-group-toggle gs-native-lux-tb-group-toggle--open"
                        } else {
                            "gs-native-lux-tb-group-toggle"
                        },
                        r#type: "button",
                        aria_expanded: "{analysis_on}",
                        aria_label: "Analysis tools",
                        title: "Analysis tools",
                        onclick: move |_| analysis_open.with_mut(|o| *o = !*o),
                        i { class: "fa-solid fa-chart-line", aria_hidden: "true" }
                    }

                    if analysis_on {
                        div { class: "gs-native-lux-tb-group-panel gs-native-lux-tb-group-panel--open",
                            for tool in ANALYSIS_TOOLS.iter() {
                                { rail_btn(tool, &active_tool, on_select) }
                            }
                        }
                    }

                    button {
                        class: if intel_on {
                            "gs-native-lux-tb-group-toggle gs-native-lux-tb-group-toggle--open"
                        } else {
                            "gs-native-lux-tb-group-toggle"
                        },
                        r#type: "button",
                        aria_expanded: "{intel_on}",
                        aria_label: "Intelligence tools",
                        title: "Intelligence tools",
                        onclick: move |_| intelligence_open.with_mut(|o| *o = !*o),
                        i { class: "fa-solid fa-wand-magic-sparkles", aria_hidden: "true" }
                    }

                    if intel_on {
                        div { class: "gs-native-lux-tb-group-panel gs-native-lux-tb-group-panel--open",
                            for tool in INTELLIGENCE_TOOLS.iter() {
                                { rail_btn(tool, &active_tool, on_select) }
                            }
                        }
                    }

                    button {
                        class: if active_tool == "print" {
                            "gs-native-toolbox-rail__btn gs-native-toolbox-rail__btn--active"
                        } else {
                            "gs-native-toolbox-rail__btn"
                        },
                        r#type: "button",
                        title: "Print map — preview & PDF export",
                        aria_label: "Print map",
                        aria_pressed: "{print_on}",
                        onclick: move |_| on_select.call("print".into()),
                        i { class: "fa-solid fa-print", aria_hidden: "true" }
                    }
                }
            }
    }
}

fn rail_btn(tool: &RailTool, active_tool: &str, on_select: EventHandler<String>) -> Element {
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

#[component]
fn AgentChatRailIcon() -> Element {
    rsx! {
        span { class: "gs-native-agent-chat-icon", aria_hidden: "true",
            svg {
                class: "gs-native-agent-chat-icon__svg",
                view_box: "0 0 24 24",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                path {
                    d: "M4.75 4.25h11.25c1.24 0 2.25 1.01 2.25 2.25v5.85c0 1.24-1.01 2.25-2.25 2.25H9.15L5.5 18.25l1.05-4.6H4.75c-1.24 0-2.25-1.01-2.25-2.25V6.5c0-1.24 1.01-2.25 2.25-2.25Z",
                    fill: "url(#gs-cai-shell)",
                    stroke: "rgba(255,255,255,0.32)",
                    stroke_width: "0.5",
                }
                path {
                    d: "M7.35 6.85h9.3c.55 0 1 .45 1 1v4.35c0 .55-.45 1-1 1H9.55l-1.75 1.9.6-1.9H7.35c-.55 0-1-.45-1-1V7.85c0-.55.45-1 1-1Z",
                    fill: "rgba(15,23,42,0.72)",
                }
                line {
                    x1: "9.1",
                    y1: "9.85",
                    x2: "14.9",
                    y2: "9.85",
                    stroke: "#bae6fd",
                    stroke_width: "1.05",
                    stroke_linecap: "round",
                }
                line {
                    x1: "9.1",
                    y1: "12.15",
                    x2: "13.0",
                    y2: "12.15",
                    stroke: "#bae6fd",
                    stroke_width: "1.05",
                    stroke_linecap: "round",
                    opacity: "0.82",
                }
                circle {
                    cx: "17.15",
                    cy: "7.05",
                    r: "1.05",
                    fill: "#67e8f9",
                }
                defs {
                    linearGradient {
                        id: "gs-cai-shell",
                        x1: "4",
                        y1: "3",
                        x2: "20",
                        y2: "19",
                        gradient_units: "userSpaceOnUse",
                        stop { stop_color: "#6366f1" }
                        stop { offset: "0.45", stop_color: "#8b5cf6" }
                        stop { offset: "1", stop_color: "#22d3ee" }
                    }
                }
            }
        }
    }
}
