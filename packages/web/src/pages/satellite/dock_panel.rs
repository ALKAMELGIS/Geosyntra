//! Fixed dock panels — map tools and toolbox rails (non-floating).

use dioxus::prelude::*;

#[component]
pub fn MapDock(
    class: String,
    title: Option<String>,
    on_close: Option<EventHandler<()>>,
    children: Element,
) -> Element {
    rsx! {
        div {
            class: "{class} gs-native-dock",
            if title.is_some() || on_close.is_some() {
                div { class: "gs-native-dock__header",
                    if let Some(ref label) = title {
                        span { class: "gs-native-dock__title", "{label}" }
                    }
                    if let Some(on_close) = on_close {
                        button {
                            class: "gs-native-dock__close",
                            r#type: "button",
                            title: "Close",
                            aria_label: "Close panel",
                            onclick: move |_| on_close.call(()),
                            i { class: "fa-solid fa-xmark", aria_hidden: "true" }
                        }
                    }
                }
            }
            div { class: "gs-native-dock__body",
                {children}
            }
        }
    }
}
