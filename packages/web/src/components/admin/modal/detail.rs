use dioxus::prelude::*;

use super::shell::AdminModal;

#[component]
pub fn AdminDetailModal(
    open: bool,
    title: String,
    on_close: EventHandler<()>,
    fields: Vec<(String, String)>,
) -> Element {
    rsx! {
        AdminModal {
            open,
            title,
            on_close,
            dl { class: "gs-detail-grid",
                for (label, value) in fields {
                    div { class: "gs-detail-row", key: "{label}",
                        dt { class: "gs-detail-label", "{label}" }
                        dd { class: "gs-detail-value", "{value}" }
                    }
                }
            }
            footer { class: "gs-modal-footer",
                button {
                    class: "gs-btn gs-btn--primary gs-btn--inline",
                    r#type: "button",
                    onclick: move |_| on_close.call(()),
                    "Close"
                }
            }
        }
    }
}
