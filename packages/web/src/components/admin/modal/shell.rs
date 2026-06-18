use dioxus::prelude::*;

#[component]
pub fn AdminModal(
    open: bool,
    title: String,
    on_close: EventHandler<()>,
    children: Element,
) -> Element {
    if !open {
        return rsx! {};
    }
    rsx! {
        div {
            class: "gs-modal-backdrop",
            role: "dialog",
            aria_modal: "true",
            aria_labelledby: "gs-modal-title",
            onclick: move |_| on_close.call(()),
            div {
                class: "gs-modal",
                onclick: move |e| e.stop_propagation(),
                header { class: "gs-modal-header",
                    h2 { id: "gs-modal-title", class: "gs-modal-title", "{title}" }
                    button {
                        class: "gs-modal-close",
                        r#type: "button",
                        aria_label: "Close",
                        onclick: move |_| on_close.call(()),
                        "×"
                    }
                }
                div { class: "gs-modal-body", {children} }
            }
        }
    }
}
