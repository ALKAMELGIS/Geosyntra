//! Native GIS map shell — 3D globe canvas + docked tools/toolbox + status HUD (Task 31.2).

use dioxus::prelude::*;

use super::{
    floating_drag::{DraggableFloat, FloatSlot},
    layer_swipe_panel::{LayerSwipePanel, SwipeState},
    map_brand::MapGeoSyntraBrand,
    map_status_bar::{MapPointer, MapStatusBar},
    map_token_banner::MapTokenStatusBanner,
    toolbox_rail::ToolboxRail,
    tool_panel::tool_panel_title,
};
use crate::gis::native::MAP_CONTAINER_ID;

#[component]
pub fn MapShell(
    active_tool: String,
    map_ready: bool,
    map_error: Option<String>,
    gl_access_token: String,
    mapbox_configured: bool,
    mapbox_proxy_mode: bool,
    mapbox_has_public_token: bool,
    viewport_density: String,
    pointer: Option<MapPointer>,
    projection_label: String,
    on_tool_select: EventHandler<String>,
    toolbox_pinned: bool,
    on_toolbox_pin: EventHandler<bool>,
    on_toolbox_mouse_leave: EventHandler<()>,
    swipe_active: bool,
    swipe_state: Signal<SwipeState>,
    map_handle_id: Option<String>,
    on_swipe_close: EventHandler<()>,
    on_tool_panel_close: EventHandler<()>,
    on_zoom_in: EventHandler<()>,
    on_zoom_out: EventHandler<()>,
    on_go_home: EventHandler<()>,
    map_tools: Element,
    tool_panel: Element,
) -> Element {
    let tool_title = if active_tool.is_empty() {
        None
    } else {
        Some(tool_panel_title(&active_tool).to_string())
    };

    rsx! {
        div {
            class: "gs-gis-body gs-native-shell",
            "data-viewport-density": "{viewport_density}",
            div { class: "gs-gis-main gs-native-main",
                div { class: "gs-native-map-stage",
                    aside {
                        class: "gs-native-map-tools-column",
                        "data-testid": "map-tools-dock",
                        {map_tools}
                    }

                    div { class: "gs-gis-map-wrap gs-native-map-wrap",
                        div { class: "gs-native-space-backdrop", aria_hidden: "true" }

                        MapGeoSyntraBrand {}

                        MapTokenStatusBanner {
                            token: gl_access_token.clone(),
                            map_ready: map_ready,
                            mapbox_configured: mapbox_configured,
                            mapbox_proxy_mode: mapbox_proxy_mode,
                            has_public_token: mapbox_has_public_token,
                        }

                        div {
                            class: if map_ready { "gs-gis-map-loading gs-gis-map-loading--hidden" } else { "gs-gis-map-loading" },
                            aria_hidden: if map_ready { "true" } else { "false" },
                            p { "Loading 3D globe…" }
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

                        MapStatusBar {
                            pointer: pointer,
                            projection_label: projection_label,
                            on_zoom_in: on_zoom_in,
                            on_zoom_out: on_zoom_out,
                            on_go_home: on_go_home,
                        }
                    }

                    aside {
                        class: "gs-native-toolbox-column",
                        "data-testid": "toolbox-dock",
                        onmouseleave: move |_| on_toolbox_mouse_leave.call(()),

                        div { class: "gs-native-lux-tb-shell gs-native-lux-tb-shell--visible",
                            ToolboxRail {
                                active_tool: active_tool,
                                toolbox_pinned: toolbox_pinned,
                                on_pin: on_toolbox_pin,
                                on_select: on_tool_select,
                            }
                        }
                    }
                }
            }
        }
    }
}
