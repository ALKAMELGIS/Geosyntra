//! Draggable floating widgets within the map canvas (React float panel parity).

use dioxus::html::point_interaction::InteractionLocation;
use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

const POS_PREFIX: &str = "geosyntra_float_pos_v2";
const MAP_WRAP_CLASS: &str = "gs-native-map-wrap";
const TOOLBOX_W: f64 = 44.0;
const DOCK_GAP: f64 = 10.0;
const MAP_MARGIN: f64 = 10.0;
const STATUS_RESERVE: f64 = 52.0;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct FloatPos {
    pub x: f64,
    pub y: f64,
}

/// Initial placement slots — panels sit left of the toolbox rail (React `siMapRightPopout`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FloatSlot {
    Toolbox,
    ToolPanel,
    LayerSwipe,
    MapControls,
}

impl FloatSlot {
    fn dimensions(self) -> (f64, f64) {
        match self {
            FloatSlot::Toolbox => (TOOLBOX_W, 420.0),
            FloatSlot::ToolPanel => (288.0, 480.0),
            FloatSlot::LayerSwipe => (256.0, 220.0),
            FloatSlot::MapControls => (40.0, 360.0),
        }
    }

    fn top_bias(self) -> f64 {
        match self {
            FloatSlot::Toolbox => 0.0,
            FloatSlot::ToolPanel => 0.06,
            FloatSlot::LayerSwipe => 0.28,
            FloatSlot::MapControls => 0.16,
        }
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn map_wrap_size() -> Option<(f64, f64)> {
    use wasm_bindgen::JsCast;
    let document = web_sys::window()?.document()?;
    let wrap = document.query_selector(&format!(".{MAP_WRAP_CLASS}")).ok()??;
    let html = wrap.dyn_into::<web_sys::HtmlElement>().ok()?;
    Some((html.client_width() as f64, html.client_height() as f64))
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn map_wrap_size() -> Option<(f64, f64)> {
    None
}

/// Default position beside the toolbox rail (left of dock, stacked by slot bias).
pub fn default_beside_toolbox(slot: FloatSlot) -> FloatPos {
    let (panel_w, panel_h) = slot.dimensions();
    let bias = slot.top_bias();

    if let Some((wrap_w, wrap_h)) = map_wrap_size() {
        let toolbox_x = (wrap_w - TOOLBOX_W - MAP_MARGIN).max(MAP_MARGIN);
        let avail_h = (wrap_h - MAP_MARGIN * 2.0 - STATUS_RESERVE - panel_h).max(120.0);

        let (x, y) = match slot {
            FloatSlot::Toolbox => (toolbox_x, MAP_MARGIN),
            FloatSlot::MapControls => {
                let x = (toolbox_x - DOCK_GAP - panel_w).max(MAP_MARGIN);
                (x, MAP_MARGIN + avail_h * bias)
            }
            FloatSlot::ToolPanel => {
                let mc_w = FloatSlot::MapControls.dimensions().0;
                let x = (toolbox_x - DOCK_GAP - mc_w - DOCK_GAP - panel_w).max(MAP_MARGIN);
                (x, MAP_MARGIN + avail_h * bias)
            }
            FloatSlot::LayerSwipe => {
                let x = (wrap_w - TOOLBOX_W - MAP_MARGIN - DOCK_GAP - panel_w).max(MAP_MARGIN);
                (x, MAP_MARGIN + avail_h * bias)
            }
        };
        return FloatPos { x, y };
    }

    // SSR / fallback — 1280×720 map area
    let wrap_w = 1280.0;
    let toolbox_x = wrap_w - TOOLBOX_W - MAP_MARGIN;
    match slot {
        FloatSlot::Toolbox => FloatPos {
            x: toolbox_x,
            y: MAP_MARGIN,
        },
        FloatSlot::MapControls => FloatPos {
            x: toolbox_x - DOCK_GAP - panel_w,
            y: MAP_MARGIN + 80.0,
        },
        FloatSlot::ToolPanel => FloatPos {
            x: toolbox_x - DOCK_GAP - 40.0 - DOCK_GAP - panel_w,
            y: MAP_MARGIN,
        },
        FloatSlot::LayerSwipe => FloatPos {
            x: wrap_w - TOOLBOX_W - MAP_MARGIN - DOCK_GAP - panel_w,
            y: 220.0,
        },
    }
}

pub fn load_float_pos(storage_key: &str, slot: FloatSlot) -> FloatPos {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let storage_key = format!("{POS_PREFIX}:{storage_key}");
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(&storage_key) {
                    if let Ok(pos) = serde_json::from_str::<FloatPos>(&raw) {
                        return pos;
                    }
                }
            }
        }
    }
    let _ = storage_key;
    default_beside_toolbox(slot)
}

pub fn save_float_pos(key: &str, pos: FloatPos) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let storage_key = format!("{POS_PREFIX}:{key}");
        if let Ok(json) = serde_json::to_string(&pos) {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item(&storage_key, &json);
                }
            }
        }
    }
    let _ = (key, pos);
}

fn clamp_in_map(pos: FloatPos, slot: FloatSlot) -> FloatPos {
    let (panel_w, panel_h) = slot.dimensions();
    let Some((wrap_w, wrap_h)) = map_wrap_size() else {
        return FloatPos {
            x: pos.x.max(MAP_MARGIN),
            y: pos.y.max(MAP_MARGIN),
        };
    };
    FloatPos {
        x: pos
            .x
            .max(MAP_MARGIN)
            .min((wrap_w - panel_w - MAP_MARGIN).max(MAP_MARGIN)),
        y: pos
            .y
            .max(MAP_MARGIN)
            .min((wrap_h - panel_h - STATUS_RESERVE - MAP_MARGIN).max(MAP_MARGIN)),
    }
}

#[component]
pub fn DraggableFloat(
    storage_key: String,
    slot: FloatSlot,
    class: String,
    title: Option<String>,
    on_close: Option<EventHandler<()>>,
    children: Element,
) -> Element {
    let mut pos = use_signal(|| load_float_pos(&storage_key, slot));
    let mut drag = use_signal(|| None::<(f64, f64, f64, f64)>);
    let key_up = storage_key.clone();
    let key_cancel = storage_key;

    let style = format!(
        "left:{}px;top:{}px;",
        pos().x.round(),
        pos().y.round()
    );

    let start_drag = move |e: Event<PointerData>| {
        let c = e.data().client_coordinates();
        drag.set(Some((c.x, c.y, pos().x, pos().y)));
    };

    rsx! {
        div {
            class: "{class} gs-native-draggable",
            style: "{style}",
            onpointermove: move |e| {
                if let Some((sx, sy, ox, oy)) = *drag.read() {
                    let c = e.data().client_coordinates();
                    let next = FloatPos {
                        x: ox + c.x - sx,
                        y: oy + c.y - sy,
                    };
                    pos.set(clamp_in_map(next, slot));
                }
            },
            onpointerup: move |_| {
                if drag.read().is_some() {
                    drag.set(None);
                    save_float_pos(&key_up, pos());
                }
            },
            onpointercancel: move |_| {
                if drag.read().is_some() {
                    drag.set(None);
                    save_float_pos(&key_cancel, pos());
                }
            },

            div { class: "gs-native-draggable__chrome",
                button {
                    class: "gs-native-draggable__grip",
                    r#type: "button",
                    title: "Drag to reposition",
                    aria_label: "Drag panel",
                    onpointerdown: start_drag,
                    i { class: "fa-solid fa-grip-vertical", aria_hidden: "true" }
                }

                if let Some(ref label) = title {
                    span { class: "gs-native-draggable__title", "{label}" }
                }

                if let Some(on_close) = on_close {
                    button {
                        class: "gs-native-draggable__close",
                        r#type: "button",
                        title: "Close",
                        aria_label: "Close panel",
                        onclick: move |_| on_close.call(()),
                        i { class: "fa-solid fa-xmark", aria_hidden: "true" }
                    }
                } else {
                    span { class: "gs-native-draggable__close-spacer", aria_hidden: "true" }
                }
            }

            div { class: "gs-native-draggable__body",
                {children}
            }
        }
    }
}
