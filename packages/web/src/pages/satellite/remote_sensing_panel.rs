//! Remote sensing toolbox panel — React `si-field-analysis` parity (Task 31).

use dioxus::prelude::*;

use super::tool_panel::WMS_LAYER_ID;
use crate::gis::{
    collections_for, index_catalog, index_label_for, providers, resolve_index_id, AddedLayer,
    AoiRecord, LayerSettings, RemoteSensingSettings, INDEX_RASTER_LAYER_ID,
};

#[component]
pub fn RemoteSensingPanel(
    layers: Signal<Vec<AddedLayer>>,
    layer_settings: Signal<LayerSettings>,
    rs_settings: Signal<RemoteSensingSettings>,
    aois: Signal<Vec<AoiRecord>>,
    draw_points: Signal<usize>,
    draw_tool: Signal<String>,
    timeline_active: Signal<bool>,
    rs_status: Signal<String>,
    on_layers_changed: EventHandler<()>,
    on_sync_wms: EventHandler<bool>,
    on_index_change: EventHandler<String>,
    on_rs_settings_changed: EventHandler<()>,
    on_open_add_data: EventHandler<()>,
    on_start_draw: EventHandler<()>,
    on_clear_draw: EventHandler<()>,
    on_set_draw_tool: EventHandler<String>,
    on_generate_timeline: EventHandler<()>,
    on_open_charts: EventHandler<()>,
) -> Element {
    let mut inner_tab = use_signal(|| "main".to_string());

    let settings = rs_settings();
    let active_index = resolve_index_id(&layer_settings().active_index_id).to_string();
    let index_label = index_label_for(&active_index);
    let wms_on = layers()
        .iter()
        .find(|l| l.id == INDEX_RASTER_LAYER_ID)
        .map(|l| l.visible)
        .unwrap_or(false);

    let tab = inner_tab();
    let main_on = tab == "main";
    let field_on = tab == "field";
    let collections = collections_for(&settings.provider_id);
    let aoi_list = aois();
    let tool = draw_tool();
    let timeline_on = timeline_active();
    let status = rs_status();

    rsx! {
        div { class: "gs-native-rs-panel",
            div {
                class: "gs-native-layers-panel__tabs",
                role: "tablist",
                aria_label: "Remote sensing tools",

                button {
                    class: if main_on {
                        "gs-native-layers-panel__tab gs-native-layers-panel__tab--on"
                    } else {
                        "gs-native-layers-panel__tab"
                    },
                    r#type: "button",
                    role: "tab",
                    aria_selected: "{main_on}",
                    onclick: move |_| inner_tab.set("main".into()),
                    "Main"
                }
                button {
                    class: if field_on {
                        "gs-native-layers-panel__tab gs-native-layers-panel__tab--on"
                    } else {
                        "gs-native-layers-panel__tab"
                    },
                    r#type: "button",
                    role: "tab",
                    aria_selected: "{field_on}",
                    onclick: move |_| inner_tab.set("field".into()),
                    "Field"
                }
            }

            if main_on {
                div { class: "gs-native-rs-panel__body", role: "tabpanel",
                    div { class: "gs-native-rs-section",
                        label { class: "gs-native-rs-field",
                            span { class: "gs-native-rs-field__label", "Satellite provider" }
                            select {
                                class: "gs-native-tool-panel__select",
                                value: "{settings.provider_id}",
                                aria_label: "Satellite provider",
                                onchange: move |e| {
                                    rs_settings.with_mut(|s| {
                                        s.provider_id = e.value();
                                        let cols = collections_for(&s.provider_id);
                                        if let Some(first) = cols.first() {
                                            s.collection_id = first.id.to_string();
                                        }
                                    });
                                    on_rs_settings_changed.call(());
                                },
                                for p in providers() {
                                    option {
                                        value: "{p.id}",
                                        selected: p.id == settings.provider_id,
                                        "{p.label}"
                                    }
                                }
                            }
                        }
                    }

                    if !collections.is_empty() {
                        div { class: "gs-native-rs-section",
                            label { class: "gs-native-rs-field",
                                span { class: "gs-native-rs-field__label", "Sensor / Collection" }
                                select {
                                    class: "gs-native-tool-panel__select",
                                    value: "{settings.collection_id}",
                                    aria_label: "Sensor or collection",
                                    onchange: move |e| {
                                        rs_settings.with_mut(|s| s.collection_id = e.value());
                                        on_rs_settings_changed.call(());
                                    },
                                    for c in collections {
                                        option {
                                            value: "{c.id}",
                                            selected: c.id == settings.collection_id,
                                            "{c.label}"
                                        }
                                    }
                                }
                            }
                        }
                    }

                    div { class: "gs-native-rs-section",
                        label { class: "gs-native-rs-field",
                            span { class: "gs-native-rs-field__label", "Imagery date" }
                            input {
                                class: "gs-native-rs-field__input",
                                r#type: "date",
                                value: "{settings.imagery_date}",
                                aria_label: "Imagery date",
                                onchange: move |e| {
                                    let v = e.value();
                                    if !v.is_empty() {
                                        rs_settings.with_mut(|s| s.imagery_date = v);
                                        on_rs_settings_changed.call(());
                                    }
                                },
                            }
                        }
                    }

                    div { class: "gs-native-rs-section",
                        label { class: "gs-native-rs-field",
                            span { class: "gs-native-rs-field__label", "Layer" }
                            select {
                                class: "gs-native-tool-panel__select",
                                value: "{active_index}",
                                aria_label: "Remote sensing layer",
                                onchange: move |e| on_index_change.call(e.value()),
                                for entry in index_catalog() {
                                    option {
                                        value: "{entry.id}",
                                        selected: entry.id == active_index,
                                        "{entry.label}"
                                    }
                                }
                            }
                        }

                        label { class: "gs-native-rs-vis",
                            input {
                                r#type: "checkbox",
                                checked: wms_on,
                                onchange: move |_| {
                                    let mut list = layers();
                                    if let Some(row) = list.iter_mut().find(|l| l.id == WMS_LAYER_ID) {
                                        row.visible = !wms_on;
                                        layers.set(list.clone());
                                        on_sync_wms.call(!wms_on);
                                        on_layers_changed.call(());
                                    }
                                },
                            }
                            span { "Show {index_label} on map" }
                        }

                        button {
                            class: "gs-native-rs-upload-btn",
                            r#type: "button",
                            onclick: move |_| on_open_add_data.call(()),
                            i { class: "fa-solid fa-cloud-arrow-up", aria_hidden: "true" }
                            span { "Add Data Source (AOI)" }
                        }
                    }

                    div { class: "gs-native-rs-section",
                        div { class: "gs-native-rs-kicker", "Time-series analysis" }
                        div { class: "gs-native-rs-date-row",
                            label { class: "gs-native-rs-field",
                                span { class: "gs-native-rs-field__label", "Start" }
                                input {
                                    class: "gs-native-rs-field__input",
                                    r#type: "date",
                                    value: "{settings.time_series_start}",
                                    aria_label: "Time series start",
                                    onchange: move |e| {
                                        let v = e.value();
                                        if !v.is_empty() {
                                            rs_settings.with_mut(|s| s.time_series_start = v);
                                            on_rs_settings_changed.call(());
                                        }
                                    },
                                }
                            }
                            label { class: "gs-native-rs-field",
                                span { class: "gs-native-rs-field__label", "End" }
                                input {
                                    class: "gs-native-rs-field__input",
                                    r#type: "date",
                                    value: "{settings.time_series_end}",
                                    aria_label: "Time series end",
                                    onchange: move |e| {
                                        let v = e.value();
                                        if !v.is_empty() {
                                            rs_settings.with_mut(|s| s.time_series_end = v);
                                            on_rs_settings_changed.call(());
                                        }
                                    },
                                }
                            }
                        }
                    }

                    div { class: "gs-native-rs-section",
                        div { class: "gs-native-rs-kicker", "Drawing tools" }
                        div {
                            class: "gs-native-rs-toolbar",
                            role: "group",
                            aria_label: "AOI drawing tools",

                            div { class: "gs-native-rs-toolbar__row",
                                DrawToolBtn {
                                    icon: "fa-regular fa-square",
                                    title: "Rectangle AOI (use polygon)",
                                    pressed: false,
                                    disabled: true,
                                    onclick: move |_| {},
                                }
                                DrawToolBtn {
                                    icon: "fa-solid fa-draw-polygon",
                                    title: "Polygon AOI",
                                    pressed: tool == "polygon",
                                    disabled: false,
                                    onclick: move |_| {
                                        on_set_draw_tool.call("polygon".into());
                                        on_start_draw.call(());
                                    },
                                }
                                DrawToolBtn {
                                    icon: "fa-regular fa-circle",
                                    title: "Circle AOI (coming soon)",
                                    pressed: false,
                                    disabled: true,
                                    onclick: move |_| {},
                                }
                                DrawToolBtn {
                                    icon: "fa-solid fa-eraser",
                                    title: "Clear drawing",
                                    pressed: false,
                                    disabled: draw_points() == 0,
                                    onclick: move |_| on_clear_draw.call(()),
                                }
                            }

                            div { class: "gs-native-rs-toolbar__row",
                                DrawToolBtn {
                                    icon: "fa-solid fa-hand",
                                    title: "View — pan and zoom",
                                    pressed: tool == "view",
                                    disabled: false,
                                    onclick: move |_| on_set_draw_tool.call("view".into()),
                                }
                                DrawToolBtn {
                                    icon: "fa-solid fa-ruler",
                                    title: "Measure",
                                    pressed: tool == "line",
                                    disabled: false,
                                    onclick: move |_| on_set_draw_tool.call("line".into()),
                                }
                                DrawToolBtn {
                                    icon: "fa-solid fa-chart-pie",
                                    title: "AOI timeline charts",
                                    pressed: false,
                                    disabled: !timeline_on,
                                    onclick: move |_| on_open_charts.call(()),
                                }
                            }
                        }

                        if draw_points() > 0 {
                            p { class: "gs-native-tool-panel__hint",
                                "Vertices: {draw_points()}. Double-click or use AOI panel Finish to commit."
                            }
                        }
                    }

                    div { class: "gs-native-rs-actions",
                        button {
                            class: if timeline_on {
                                "gs-native-rs-timeline-btn gs-native-rs-timeline-btn--stop"
                            } else {
                                "gs-native-rs-timeline-btn"
                            },
                            r#type: "button",
                            onclick: move |_| on_generate_timeline.call(()),
                            i {
                                class: if timeline_on {
                                    "fa-solid fa-stop"
                                } else {
                                    "fa-solid fa-chart-line"
                                },
                                aria_hidden: "true"
                            }
                            if timeline_on {
                                " Stop Timeline"
                            } else {
                                " Generate timeline"
                            }
                        }
                    }

                    if !status.is_empty() {
                        p { class: "gs-native-rs-status", "{status}" }
                    }
                }
            } else {
                div { class: "gs-native-rs-panel__body", role: "tabpanel",
                    if aoi_list.is_empty() {
                        p { class: "gs-native-rs-status",
                            "No workspace AOIs yet. Use Main to add a data source or draw an AOI, then return here."
                        }
                    } else {
                        div { class: "gs-native-rs-kicker", "Workspace AOIs" }
                        ul { class: "gs-native-aoi-list",
                            for aoi in aoi_list.iter() {
                                li { key: "{aoi.id}",
                                    span { class: "gs-native-rs-aoi-name", "{aoi.name}" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn DrawToolBtn(
    icon: &'static str,
    title: &'static str,
    pressed: bool,
    disabled: bool,
    onclick: EventHandler<()>,
) -> Element {
    rsx! {
        button {
            class: if pressed {
                "gs-native-rs-tool gs-native-rs-tool--on"
            } else {
                "gs-native-rs-tool"
            },
            r#type: "button",
            title: "{title}",
            disabled: disabled,
            aria_pressed: "{pressed}",
            onclick: move |_| onclick.call(()),
            i { class: "{icon}", aria_hidden: "true" }
        }
    }
}
