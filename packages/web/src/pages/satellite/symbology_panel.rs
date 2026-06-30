//! Symbology studio panel — React `SiSymbologySidePanel.tsx` (Task 32.4e).

use dioxus::prelude::*;

use crate::gis::{SymbologyConfig, SymbologyStyle, resolve_style_pack, style_pack_from_config};

#[component]
pub fn SymbologyPanel(
    config: Signal<SymbologyConfig>,
    on_apply: EventHandler<SymbologyConfig>,
) -> Element {
    let c = config();
    rsx! {
        div { class: "gs-native-symbology-panel",
            p { class: "gs-native-tool-panel__hint",
                "Style studio — single, unique, or graduated symbology."
            }
            label { class: "gs-native-tool-panel__label",
                "Style mode"
                select {
                    value: "{sym_style_value(c.style)}",
                    onchange: move |e| {
                        let style = match e.value().as_str() {
                            "unique" => SymbologyStyle::Unique,
                            "graduated" => SymbologyStyle::Graduated,
                            _ => SymbologyStyle::Single,
                        };
                        config.with_mut(|cfg| cfg.style = style);
                    },
                    option { value: "single", "Single symbol" }
                    option { value: "unique", "Unique values" }
                    option { value: "graduated", "Graduated colors" }
                }
            }
            label { class: "gs-native-tool-panel__label",
                "Fill color"
                input {
                    r#type: "color",
                    value: "{c.single.fill_color}",
                    oninput: move |e| {
                        config.with_mut(|cfg| cfg.single.fill_color = e.value());
                    },
                }
            }
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                onclick: move |_| {
                    let mut next = config();
                    next.user_configured = true;
                    let _pack = style_pack_from_config(&next);
                    let _ = resolve_style_pack(Some(&next));
                    on_apply.call(next);
                },
                "Apply symbology"
            }
        }
    }
}

fn sym_style_value(style: SymbologyStyle) -> &'static str {
    match style {
        SymbologyStyle::Single => "single",
        SymbologyStyle::Unique => "unique",
        SymbologyStyle::Graduated => "graduated",
    }
}
