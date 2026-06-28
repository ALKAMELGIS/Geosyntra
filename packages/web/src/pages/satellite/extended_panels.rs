//! Extended toolbox panels — Task 31.10–31.15.

use dioxus::prelude::*;

use crate::gis::FieldRecord;

#[derive(Debug, Clone, PartialEq)]
pub struct ChatLine {
    pub role: String,
    pub text: String,
}

#[component]
pub fn GeoAiPanel(
    messages: Signal<Vec<ChatLine>>,
    draft: Signal<String>,
    busy: Signal<bool>,
    error: Signal<Option<String>>,
    on_send: EventHandler<()>,
) -> Element {
    rsx! {
        div { class: "gs-native-geo-ai",
            p { class: "gs-native-tool-panel__hint",
                "Ask about layers, AOI, or map context via Axum Geo AI chat."
            }
            div { class: "gs-native-geo-ai__log",
                for (i, msg) in messages().iter().enumerate() {
                    {
                        let role = msg.role.clone();
                        let text = msg.text.clone();
                        rsx! {
                            div {
                                key: "{i}",
                                class: if role == "user" {
                                    "gs-native-geo-ai__msg gs-native-geo-ai__msg--user"
                                } else {
                                    "gs-native-geo-ai__msg gs-native-geo-ai__msg--bot"
                                },
                                "{text}"
                            }
                        }
                    }
                }
            }
            if let Some(err) = error() {
                p { class: "gs-native-tool-panel__error", "{err}" }
            }
            div { class: "gs-native-geo-ai__composer",
                input {
                    class: "gs-native-tool-panel__input",
                    r#type: "text",
                    placeholder: "Ask Geo AI…",
                    value: "{draft()}",
                    disabled: busy(),
                    oninput: move |e| draft.set(e.value()),
                    onkeydown: move |e| {
                        if e.key() == Key::Enter {
                            on_send.call(());
                        }
                    },
                }
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    disabled: busy(),
                    onclick: move |_| on_send.call(()),
                    if busy() { "Sending…" } else { "Send" }
                }
            }
        }
    }
}

#[component]
pub fn MeasurePanel(
    length_m: Signal<f64>,
    point_count: Signal<usize>,
    on_start: EventHandler<()>,
    on_clear: EventHandler<()>,
) -> Element {
    let km = length_m() / 1000.0;
    let label = if length_m() >= 1000.0 {
        format!("{km:.2} km")
    } else {
        format!("{:.0} m", length_m())
    };
    rsx! {
        p { class: "gs-native-tool-panel__hint",
            "Click map vertices to measure path length. Points: {point_count()}"
        }
        p { class: "gs-native-measure-readout", "Length: {label}" }
        div { class: "gs-native-tool-panel__actions",
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                onclick: move |_| on_start.call(()),
                "Measure line"
            }
            button {
                class: "gs-native-tool-panel__btn gs-native-tool-panel__btn--ghost",
                r#type: "button",
                onclick: move |_| on_clear.call(()),
                "Clear"
            }
        }
    }
}

#[component]
pub fn RoutePanel(
    length_m: Signal<f64>,
    point_count: Signal<usize>,
    route_status: Signal<String>,
    on_start: EventHandler<()>,
    on_compute: EventHandler<()>,
    on_clear: EventHandler<()>,
) -> Element {
    let km = length_m() / 1000.0;
    let len_text = format!("Route length ≈ {km:.2} km");
    rsx! {
        p { class: "gs-native-tool-panel__hint",
            "Click waypoints, then compute route via GraphHopper (Axum gateway)."
        }
        p { "{len_text}" }
        p { class: "gs-native-tool-panel__hint", "Waypoints: {point_count()}" }
        if !route_status().is_empty() {
            p { class: "gs-native-route-status", "{route_status()}" }
        }
        div { class: "gs-native-tool-panel__actions",
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                onclick: move |_| on_start.call(()),
                "Add waypoints"
            }
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                disabled: point_count() < 2,
                onclick: move |_| on_compute.call(()),
                "Compute route"
            }
            button {
                class: "gs-native-tool-panel__btn gs-native-tool-panel__btn--ghost",
                r#type: "button",
                onclick: move |_| on_clear.call(()),
                "Clear route"
            }
        }
    }
}

#[component]
pub fn WeatherPanel(summary: Signal<String>, enabled: Signal<bool>, on_toggle: EventHandler<bool>) -> Element {
    rsx! {
        p { class: "gs-native-tool-panel__hint",
            "Open-Meteo at map pointer; OpenWeatherMap when platform token is configured."
        }
        label { class: "gs-native-tool-panel__toggle",
            input {
                r#type: "checkbox",
                checked: enabled(),
                onchange: move |_| on_toggle.call(!enabled()),
            }
            " Show weather HUD"
        }
        if enabled() {
            p { class: "gs-native-weather-summary", "{summary()}" }
        }
    }
}

#[component]
pub fn PrintPanel(
    title: Signal<String>,
    on_export: EventHandler<()>,
    export_status: Signal<Option<String>>,
) -> Element {
    rsx! {
        p { class: "gs-native-tool-panel__hint",
            "Export the current map view as PNG for reports or print."
        }
        div { class: "gs-field",
            label { "Report title" }
            input {
                class: "gs-native-tool-panel__input",
                value: "{title()}",
                oninput: move |e| title.set(e.value()),
                placeholder: "GeoSyntra map export",
            }
        }
        button {
            class: "gs-native-tool-panel__btn",
            r#type: "button",
            onclick: move |_| on_export.call(()),
            "Download map PNG"
        }
        if let Some(msg) = export_status() {
            p { class: "gs-native-tool-panel__hint", "{msg}" }
        }
    }
}

#[component]
pub fn FieldsPanel(
    fields: Signal<Vec<FieldRecord>>,
    selected_id: Signal<Option<String>>,
    on_select: EventHandler<String>,
) -> Element {
    rsx! {
        p { class: "gs-native-tool-panel__hint", "Agricultural field parcels from local workspace storage." }
        ul { class: "gs-native-fields-list",
            for field in fields().iter() {
                {
                    let id = field.id.clone();
                    let active = selected_id() == Some(id.clone());
                    rsx! {
                        li { key: "{field.id}",
                            button {
                                class: if active {
                                    "gs-native-aoi-list__btn gs-native-aoi-list__btn--active"
                                } else {
                                    "gs-native-aoi-list__btn"
                                },
                                r#type: "button",
                                onclick: move |_| on_select.call(id.clone()),
                                span { class: "gs-native-fields-list__name", "{field.name}" }
                                span { class: "gs-native-fields-list__meta",
                                    {
                                        let meta = format!("{} · {:.1} ha", field.crop, field.area_ha);
                                        rsx! { "{meta}" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
