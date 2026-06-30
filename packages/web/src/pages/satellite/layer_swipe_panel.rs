//! Layer swipe floating panel + map divider (React SiMapLayerSwipeToolPanel parity).

use dioxus::prelude::*;

use super::floating_drag::{DraggableFloat, FloatSlot};
use crate::gis::native::{MapboxBridge, MapHandle};

#[derive(Debug, Clone, PartialEq)]
pub struct SwipeState {
    pub active: bool,
    pub position: f64,
    pub leading: String,
    pub trailing: String,
}

impl Default for SwipeState {
    fn default() -> Self {
        Self {
            active: false,
            position: 50.0,
            leading: "basemap".into(),
            trailing: "index".into(),
        }
    }
}

#[component]
pub fn LayerSwipePanel(
    open: bool,
    state: Signal<SwipeState>,
    map_handle_id: Option<String>,
    on_close: EventHandler<()>,
) -> Element {
    if !open {
        return rsx! {};
    }

    let s = state();
    let map_id_change_leading = map_handle_id.clone();
    let map_id_change_trailing = map_handle_id.clone();
    let map_id_range = map_handle_id.clone();
    let map_id_toggle = map_handle_id.clone();

    rsx! {
        DraggableFloat {
            storage_key: "layer-swipe-panel".to_string(),
            slot: FloatSlot::LayerSwipe,
            class: "gs-native-swipe-panel-wrap".to_string(),
            title: Some("Layer swipe".into()),
            on_close: Some(on_close),

            p { class: "gs-native-swipe-panel__hint",
                "Drag the vertical handle on the map to compare layers."
            }

            label { class: "gs-native-swipe-panel__field",
                span { "Leading (left)" }
                select {
                    value: "{s.leading}",
                    onchange: move |e| {
                        state.with_mut(|st| st.leading = e.value());
                        sync_swipe(map_id_change_leading.as_deref(), &state());
                    },
                    option { value: "basemap", "Basemap" }
                    option { value: "index", "Index raster" }
                }
            }

            label { class: "gs-native-swipe-panel__field",
                span { "Trailing (right)" }
                select {
                    value: "{s.trailing}",
                    onchange: move |e| {
                        state.with_mut(|st| st.trailing = e.value());
                        sync_swipe(map_id_change_trailing.as_deref(), &state());
                    },
                    option { value: "basemap", "Basemap" }
                    option { value: "index", "Index raster" }
                }
            }

            label { class: "gs-native-swipe-panel__field",
                span { "Divider position" }
                input {
                    r#type: "range",
                    min: "5",
                    max: "95",
                    value: "{s.position}",
                    oninput: move |e| {
                        if let Ok(v) = e.value().parse::<f64>() {
                            state.with_mut(|st| st.position = v);
                            sync_swipe(map_id_range.as_deref(), &state());
                        }
                    },
                }
            }

            label { class: "gs-native-swipe-panel__toggle",
                input {
                    r#type: "checkbox",
                    checked: s.active,
                    onchange: move |_| {
                        state.with_mut(|st| st.active = !st.active);
                        sync_swipe(map_id_toggle.as_deref(), &state());
                    },
                }
                " Active on map"
            }
        }
    }
}

pub fn sync_swipe(map_id: Option<&str>, state: &SwipeState) {
    let Some(id) = map_id else {
        return;
    };
    let handle = MapHandle { id: id.to_string() };
    MapboxBridge::set_layer_swipe(&handle, state.active, state.position);
}
