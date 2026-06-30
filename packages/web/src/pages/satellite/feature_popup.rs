//! Feature identify popup — Task 32.9.

use dioxus::prelude::*;

use crate::gis::IdentifyHit;

#[component]
pub fn FeaturePopup(hits: Signal<Vec<IdentifyHit>>, on_close: EventHandler<()>) -> Element {
    if hits().is_empty() {
        return rsx! {};
    }
    rsx! {
        div { class: "gs-native-feature-popup",
            div { class: "gs-native-feature-popup__header",
                span { "Identify ({hits().len()})" }
                button {
                    r#type: "button",
                    class: "gs-native-feature-popup__close",
                    onclick: move |_| on_close.call(()),
                    "×"
                }
            }
            ul {
                for hit in hits().iter() {
                    li { key: "{hit.layer_id}",
                        strong { "{hit.layer_name}" }
                        span { " — {hit.geometry_type}" }
                    }
                }
            }
        }
    }
}
