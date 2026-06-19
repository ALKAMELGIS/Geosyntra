//! Native GIS map shell — 3D globe canvas + toolbox rail + status HUD (Task 31.2).

use dioxus::prelude::*;

use super::{
    map_floating_controls::MapFloatingControls,
    map_status_bar::{MapPointer, MapStatusBar},
    toolbox_rail::ToolboxRail,
};
use crate::gis::native::MAP_CONTAINER_ID;

#[component]
pub fn MapShell(
    basemap_id: String,
    basemap_open: bool,
    active_tool: String,
    globe_mode: bool,
    map_ready: bool,
    map_error: Option<String>,
    pointer: Option<MapPointer>,
    projection_label: String,
    on_basemap_toggle: EventHandler<()>,
    on_basemap_select: EventHandler<String>,
    on_tool_select: EventHandler<String>,
    on_toggle_projection: EventHandler<()>,
    on_zoom_in: EventHandler<()>,
    on_zoom_out: EventHandler<()>,
    on_go_home: EventHandler<()>,
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

                    MapFloatingControls {
                        basemap_id: basemap_id.clone(),
                        basemap_open: basemap_open,
                        globe_mode: globe_mode,
                        on_basemap_toggle: on_basemap_toggle,
                        on_basemap_select: on_basemap_select,
                        on_toggle_projection: on_toggle_projection,
                    }

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
