//! Native GIS map shell — 3D globe canvas + toolbox rail + status HUD (Task 31.2).

use dioxus::prelude::*;

use super::{
    map_status_bar::{MapPointer, MapStatusBar},
    toolbox_rail::ToolboxRail,
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
    on_zoom_in: EventHandler<()>,
    on_zoom_out: EventHandler<()>,
    on_go_home: EventHandler<()>,
    floating_controls: Element,
    tool_panel: Element,
) -> Element {
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

                    {tool_panel}

                    ToolboxRail {
                        active_tool: active_tool,
                        on_select: on_tool_select,
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
