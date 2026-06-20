//! Layer control mount — React `SiMapLayerControlMount.tsx` (Task 32.2d).

use dioxus::prelude::*;

use crate::gis::AddedLayer;

#[component]
pub fn LayerControlMount(
    layers: Signal<Vec<AddedLayer>>,
    on_toggle: EventHandler<String>,
) -> Element {
    rsx! {
        div { class: "gs-native-layer-control-mount",
            p { class: "gs-native-tool-panel__label", "On-map layers" }
            ul { class: "gs-native-layer-control-list",
                for layer in layers().iter() {
                    {
                        let id = layer.id.clone();
                        let name = layer.name.clone();
                        let vis = layer.visible;
                        rsx! {
                            li { key: "{id}",
                                button {
                                    class: "gs-native-layer-control-row",
                                    r#type: "button",
                                    onclick: move |_| on_toggle.call(id.clone()),
                                    if vis { "◉" } else { "○" }
                                    " {name}"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
