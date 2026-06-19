//! Native GIS map shell — 3D globe canvas + toolbox rail + status HUD (Task 31.2).

use dioxus::prelude::*;

use super::{
    floating_drag::{DraggableFloat, FloatSlot},
    layer_swipe_panel::{LayerSwipePanel, SwipeState},
    map_status_bar::{MapPointer, MapStatusBar},
    toolbox_rail::ToolboxRail,
    tool_panel::tool_panel_title,
};
use crate::gis::native::MAP_CONTAINER_ID;

#[component]
pub fn MapShell(
    active_tool: String,
    map_ready: bool,
    map_error: Option<String>,
    pointer: Option<MapPointer>,
    projection_label: String,
    on_tool_select: EventHandler<String>,
    toolbox_open: bool,
    toolbox_pinned: bool,
    on_toolbox_toggle: EventHandler<()>,
    on_toolbox_pin: EventHandler<bool>,
    swipe_active: bool,
    swipe_state: Signal<SwipeState>,
    map_handle_id: Option<String>,
    on_toggle_swipe: EventHandler<()>,
    on_swipe_close: EventHandler<()>,
    on_tool_panel_close: EventHandler<()>,
    float_rail_visible: bool,
    on_float_rail_close: EventHandler<()>,
    on_float_rail_open: EventHandler<()>,
    on_zoom_in: EventHandler<()>,
    on_zoom_out: EventHandler<()>,
    on_go_home: EventHandler<()>,
    floating_controls: Element,
    tool_panel: Element,
) -> Element {
    let show_toolbox = toolbox_open;
    let shell_class = if show_toolbox {
        "gs-native-lux-tb-shell gs-native-lux-tb-shell--visible"
    } else {
        "gs-native-lux-tb-shell gs-native-lux-tb-shell--hidden"
    };
    let tool_title = if active_tool.is_empty() {
        None
    } else {
        Some(tool_panel_title(&active_tool).to_string())
    };

    rsx! {
        div { class: "gs-gis-body gs-native-shell",
            div { class: "gs-gis-main gs-native-main",
                div { class: "gs-gis-map-wrap gs-native-map-wrap",
                    div { class: "gs-native-space-backdrop", aria_hidden: "true" }

                    if !map_ready {
                        div { class: "gs-gis-map-loading",
                            p { "Loading 3D globe…" }
                        }
                    }

                    if let Some(err) = map_error {
                        div { class: "gs-gis-banner gs-gis-banner--error", role: "alert",
                            "{err}"
                        }
                    }

                    div {
                        id: MAP_CONTAINER_ID,
                        class: "gs-gis-map-canvas mapboxgl-map",
                        role: "region",
                        aria_label: "Map",
                        "data-testid": "native-map-canvas",
                    }

                    {floating_controls}

                    if !float_rail_visible {
                        button {
                            class: "gs-native-float-rail-reveal",
                            r#type: "button",
                            title: "Show map tools",
                            aria_label: "Show map tools",
                            onclick: move |_| on_float_rail_open.call(()),
                            i { class: "fa-solid fa-grip-vertical", aria_hidden: "true" }
                        }
                    }

                    if !active_tool.is_empty() {
                        DraggableFloat {
                            storage_key: "tool-panel".to_string(),
                            slot: FloatSlot::ToolPanel,
                            class: "gs-native-tool-panel-wrap".to_string(),
                            title: tool_title,
                            on_close: Some(on_tool_panel_close),
                            {tool_panel}
                        }
                    }

                    LayerSwipePanel {
                        open: swipe_active,
                        state: swipe_state,
                        map_handle_id: map_handle_id.clone(),
                        on_close: on_swipe_close,
                    }

                    if !show_toolbox {
                        button {
                            class: "gs-native-toolbox-reveal",
                            r#type: "button",
                            title: "Open map toolbox",
                            aria_label: "Open map toolbox",
                            onclick: move |_| on_toolbox_toggle.call(()),
                            i { class: "fa-solid fa-chevron-left", aria_hidden: "true" }
                        }
                    }

                    if show_toolbox {
                        DraggableFloat {
                            storage_key: "toolbox-rail".to_string(),
                            slot: FloatSlot::Toolbox,
                            class: shell_class.to_string(),
                            title: Some("Toolbox".into()),
                            on_close: Some(on_toolbox_toggle),

                            div {
                                onmouseleave: move |_| {
                                    if !toolbox_pinned {
                                        on_toolbox_toggle.call(());
                                    }
                                },

                                ToolboxRail {
                                    active_tool: active_tool,
                                    toolbox_pinned: toolbox_pinned,
                                    on_pin: on_toolbox_pin,
                                    on_select: on_tool_select,
                                }
                            }
                        }
                    }

                    MapStatusBar {
                        pointer: pointer,
                        projection_label: projection_label,
                        on_zoom_in: on_zoom_in,
                        on_zoom_out: on_zoom_out,
                        on_go_home: on_go_home,
                    }
                }
            }
        }
    }
}
