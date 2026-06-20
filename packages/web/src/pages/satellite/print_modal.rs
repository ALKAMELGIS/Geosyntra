//! Print modal — React `SiMapPrintModal.tsx` (Task 32.11).

use dioxus::prelude::*;

use crate::gis::{build_print_manifest, PrintPageSpec};

#[component]
pub fn PrintModal(
    open: bool,
    spec: Signal<PrintPageSpec>,
    map_png: Option<String>,
    on_print: EventHandler<()>,
    on_close: EventHandler<()>,
) -> Element {
    if !open {
        return rsx! {};
    }
    let manifest = build_print_manifest(&spec(), map_png.as_deref());
    rsx! {
        div { class: "gs-print-modal-backdrop", onclick: move |_| on_close.call(()),
            div {
                class: "gs-print-modal",
                onclick: move |e| e.stop_propagation(),
                h3 { "Print map — {manifest.title}" }
                p { "Pages: {manifest.pages.len()}" }
                label {
                    "Title"
                    input {
                        r#type: "text",
                        value: "{spec().title}",
                        oninput: move |e| spec.with_mut(|s| s.title = e.value()),
                    }
                }
                label {
                    input {
                        r#type: "checkbox",
                        checked: spec().include_legend,
                        onchange: move |e| spec.with_mut(|s| s.include_legend = e.checked()),
                    }
                    " Include legend"
                }
                footer {
                    button {
                        class: "gs-native-tool-panel__btn",
                        r#type: "button",
                        onclick: move |_| on_print.call(()),
                        "Export PNG / Print"
                    }
                    button {
                        class: "gs-native-tool-panel__btn gs-native-tool-panel__btn--ghost",
                        r#type: "button",
                        onclick: move |_| on_close.call(()),
                        "Close"
                    }
                }
            }
        }
    }
}
