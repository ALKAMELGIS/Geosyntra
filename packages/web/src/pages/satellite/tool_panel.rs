//! Toolbox dock panels — Task 31.3–31.15.

use dioxus::prelude::*;
use serde_json::{json, Value};

use super::extended_panels::{
    ChatLine, FieldsPanel, GeoAiPanel, MeasurePanel, PrintPanel, RoutePanel, WeatherPanel,
};
use crate::gis::{
    AddedLayer, AoiRecord, FieldRecord, LayerKind, LayerStore,
    native::polygon_area_km2,
};

pub const DEMO_LAYER_ID: &str = "demo-field";
pub const WMS_LAYER_ID: &str = "ndvi-demo";

pub fn demo_field_geojson() -> Value {
    json!({
        "type": "Feature",
        "properties": { "name": "Demo field" },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [53.0, 22.5], [54.2, 22.5], [54.2, 23.4], [53.0, 23.4], [53.0, 22.5]
            ]]
        }
    })
}

#[component]
pub fn ToolPanel(
    active_tool: String,
    layers: Signal<Vec<AddedLayer>>,
    aois: Signal<Vec<AoiRecord>>,
    selected_aoi_id: Signal<Option<String>>,
    identify_hits: Signal<Vec<String>>,
    symbology_color: Signal<String>,
    upload_json: Signal<String>,
    draw_points: Signal<usize>,
    on_layers_changed: EventHandler<()>,
    on_aois_changed: EventHandler<()>,
    on_add_demo_layer: EventHandler<()>,
    on_sync_wms: EventHandler<bool>,
    on_start_draw: EventHandler<()>,
    on_finish_draw: EventHandler<()>,
    on_clear_draw: EventHandler<()>,
    on_apply_symbology: EventHandler<String>,
    on_upload: EventHandler<()>,
    geo_ai_messages: Signal<Vec<ChatLine>>,
    geo_ai_draft: Signal<String>,
    geo_ai_busy: Signal<bool>,
    geo_ai_error: Signal<Option<String>>,
    on_geo_ai_send: EventHandler<()>,
    measure_length_m: Signal<f64>,
    on_start_measure: EventHandler<()>,
    on_clear_measure: EventHandler<()>,
    on_start_route: EventHandler<()>,
    on_clear_route: EventHandler<()>,
    weather_summary: Signal<String>,
    weather_enabled: Signal<bool>,
    on_toggle_weather: EventHandler<bool>,
    on_export_print: EventHandler<()>,
    export_status: Signal<Option<String>>,
    fields: Signal<Vec<FieldRecord>>,
    selected_field_id: Signal<Option<String>>,
    on_field_select: EventHandler<String>,
) -> Element {
    let show = !active_tool.is_empty();
    if !show {
        return rsx! {};
    }

    let title = panel_title(&active_tool);

    rsx! {
        div {
            class: "gs-native-tool-panel",
            role: "complementary",
            "data-testid": "gis-tool-panel",
            aria_label: "{title}",

            div { class: "gs-native-tool-panel__header",
                h2 { class: "gs-native-tool-panel__title", "{title}" }
            }

            div { class: "gs-native-tool-panel__body",
                match active_tool.as_str() {
                    "layers" | "add-data" => rsx! {
                        LayersPanel {
                            layers: layers,
                            symbology_color: symbology_color,
                            upload_json: upload_json,
                            on_layers_changed: on_layers_changed,
                            on_add_demo_layer: on_add_demo_layer,
                            on_apply_symbology: on_apply_symbology,
                            on_upload: on_upload,
                            show_upload: active_tool == "add-data",
                        }
                    },
                    "remote-sensing" | "imagery" => rsx! {
                        RemoteSensingPanel {
                            layers: layers,
                            on_layers_changed: on_layers_changed,
                            on_sync_wms: on_sync_wms,
                        }
                    },
                    "aoi" => rsx! {
                        AoiPanel {
                            aois: aois,
                            selected_aoi_id: selected_aoi_id,
                            draw_points: draw_points,
                            on_aois_changed: on_aois_changed,
                            on_start_draw: on_start_draw,
                            on_finish_draw: on_finish_draw,
                            on_clear_draw: on_clear_draw,
                        }
                    },
                    "identify" | "feature" => rsx! {
                        IdentifyPanel { hits: identify_hits }
                    },
                    "charts" | "stats" => rsx! {
                        ChartsPanel {
                            aois: aois,
                            selected_aoi_id: selected_aoi_id,
                        }
                    },
                    "geo-ai" => rsx! {
                        GeoAiPanel {
                            messages: geo_ai_messages,
                            draft: geo_ai_draft,
                            busy: geo_ai_busy,
                            error: geo_ai_error,
                            on_send: on_geo_ai_send,
                        }
                    },
                    "measure" => rsx! {
                        MeasurePanel {
                            length_m: measure_length_m,
                            point_count: draw_points,
                            on_start: on_start_measure,
                            on_clear: on_clear_measure,
                        }
                    },
                    "route" => rsx! {
                        RoutePanel {
                            length_m: measure_length_m,
                            point_count: draw_points,
                            on_start: on_start_route,
                            on_clear: on_clear_route,
                        }
                    },
                    "weather" => rsx! {
                        WeatherPanel {
                            summary: weather_summary,
                            enabled: weather_enabled,
                            on_toggle: on_toggle_weather,
                        }
                    },
                    "print" => rsx! {
                        PrintPanel {
                            on_export: on_export_print,
                            export_status: export_status,
                        }
                    },
                    "fields" => rsx! {
                        FieldsPanel {
                            fields: fields,
                            selected_id: selected_field_id,
                            on_select: on_field_select,
                        }
                    },
                    _ => rsx! {
                        p { class: "gs-native-tool-panel__hint",
                            "Tool \"{active_tool}\" is active on the map."
                        }
                    },
                }
            }
        }
    }
}

fn panel_title(tool: &str) -> &'static str {
    match tool {
        "layers" => "Layers",
        "add-data" => "Add data",
        "remote-sensing" => "Remote sensing",
        "imagery" => "Imagery",
        "aoi" => "AOI workspace",
        "identify" | "feature" => "Identify",
        "charts" => "Charts",
        "stats" => "Statistics",
        "geo-ai" => "Agent Chat",
        "weather" => "Weather",
        "route" => "Routing",
        "measure" => "Measure",
        "print" => "Print",
        "fields" => "Fields",
        _ => "Map tool",
    }
}

#[component]
fn LayersPanel(
    layers: Signal<Vec<AddedLayer>>,
    symbology_color: Signal<String>,
    upload_json: Signal<String>,
    on_layers_changed: EventHandler<()>,
    on_add_demo_layer: EventHandler<()>,
    on_apply_symbology: EventHandler<String>,
    on_upload: EventHandler<()>,
    show_upload: bool,
) -> Element {
    rsx! {
        div { class: "gs-native-layers-panel",
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                onclick: move |_| on_add_demo_layer.call(()),
                "Add demo field polygon"
            }

            if show_upload {
                label { class: "gs-native-tool-panel__label", "Paste GeoJSON feature"
                    textarea {
                        class: "gs-native-tool-panel__textarea",
                        rows: "4",
                        value: "{upload_json()}",
                        oninput: move |e| upload_json.set(e.value()),
                    }
                }
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| on_upload.call(()),
                    "Add to map"
                }
            }

            div { class: "gs-native-tool-panel__section",
                span { class: "gs-native-tool-panel__label", "Symbology" }
                select {
                    class: "gs-native-tool-panel__select",
                    value: "{symbology_color()}",
                    onchange: move |e| on_apply_symbology.call(e.value()),
                    option { value: "blue", "Blue fill" }
                    option { value: "green", "Green fill" }
                    option { value: "orange", "Orange fill" }
                }
            }

            ul { class: "gs-native-layers-list",
                for layer in layers().iter().filter(|l| l.kind != LayerKind::Basemap) {
                    {
                        let id = layer.id.clone();
                        let visible = layer.visible;
                        rsx! {
                            li { key: "{layer.id}", class: "gs-native-layers-list__row",
                                label {
                                    input {
                                        r#type: "checkbox",
                                        checked: visible,
                                        onchange: move |_| {
                                            let mut list = layers();
                                            if let Some(row) = list.iter_mut().find(|l| l.id == id) {
                                                row.visible = !visible;
                                                layers.set(list);
                                                on_layers_changed.call(());
                                            }
                                        },
                                    }
                                    " {layer.name}"
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
fn RemoteSensingPanel(
    layers: Signal<Vec<AddedLayer>>,
    on_layers_changed: EventHandler<()>,
    on_sync_wms: EventHandler<bool>,
) -> Element {
    let wms_on = layers()
        .iter()
        .find(|l| l.id == WMS_LAYER_ID)
        .map(|l| l.visible)
        .unwrap_or(false);

    rsx! {
        p { class: "gs-native-tool-panel__hint",
            "Toggle NDVI WMS overlay (demo tile template)."
        }
        label { class: "gs-native-tool-panel__toggle",
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
            " NDVI demo layer"
        }
    }
}

#[component]
fn AoiPanel(
    aois: Signal<Vec<AoiRecord>>,
    selected_aoi_id: Signal<Option<String>>,
    draw_points: Signal<usize>,
    on_aois_changed: EventHandler<()>,
    on_start_draw: EventHandler<()>,
    on_finish_draw: EventHandler<()>,
    on_clear_draw: EventHandler<()>,
) -> Element {
    rsx! {
        div { class: "gs-native-aoi-panel",
            p { class: "gs-native-tool-panel__hint",
                "Click map vertices, then Finish polygon. Points: {draw_points()}"
            }
            div { class: "gs-native-tool-panel__actions",
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| on_start_draw.call(()),
                    "Draw polygon"
                }
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| on_finish_draw.call(()),
                    "Finish"
                }
                button {
                    class: "gs-native-tool-panel__btn gs-native-tool-panel__btn--ghost",
                    r#type: "button",
                    onclick: move |_| on_clear_draw.call(()),
                    "Clear"
                }
            }

            ul { class: "gs-native-aoi-list",
                for aoi in aois().iter() {
                    {
                        let id = aoi.id.clone();
                        let active = selected_aoi_id() == Some(id.clone());
                        rsx! {
                            li { key: "{aoi.id}",
                                button {
                                    class: if active {
                                        "gs-native-aoi-list__btn gs-native-aoi-list__btn--active"
                                    } else {
                                        "gs-native-aoi-list__btn"
                                    },
                                    r#type: "button",
                                    onclick: move |_| selected_aoi_id.set(Some(id.clone())),
                                    "{aoi.name}"
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
fn IdentifyPanel(hits: Signal<Vec<String>>) -> Element {
    rsx! {
        p { class: "gs-native-tool-panel__hint", "Click the map to identify vector features." }
        if hits().is_empty() {
            p { class: "gs-native-tool-panel__empty", "No features identified yet." }
        } else {
            ul { class: "gs-native-identify-list",
                for (i, line) in hits().iter().enumerate() {
                    li { key: "{i}", "{line}" }
                }
            }
        }
    }
}

#[component]
fn ChartsPanel(aois: Signal<Vec<AoiRecord>>, selected_aoi_id: Signal<Option<String>>) -> Element {
    let aoi = selected_aoi_id()
        .and_then(|id| aois().into_iter().find(|a| a.id == id));

    let area = aoi
        .as_ref()
        .and_then(|a| polygon_area_km2(&a.geojson));
    let pct_demo = area.map(|a| (a * 12.4).min(100.0));

    rsx! {
        if let Some(rec) = aoi {
            div { class: "gs-native-charts-panel",
                p { class: "gs-native-tool-panel__label", "AOI: {rec.name}" }
                if let Some(km2) = area {
                    {
                        let text = format!("Area ≈ {km2:.2} km²");
                        rsx! { p { "{text}" } }
                    }
                }
                if let Some(pct) = pct_demo {
                    {
                        let width = format!("{pct:.0}%");
                        let label = format!("NDVI mean (demo) {pct:.0}%");
                        rsx! {
                            div { class: "gs-native-chart-bar",
                                div {
                                    class: "gs-native-chart-bar__fill",
                                    style: "width: {width}",
                                }
                                span { class: "gs-native-chart-bar__label", "{label}" }
                            }
                        }
                    }
                }
            }
        } else {
            p { class: "gs-native-tool-panel__empty", "Select or draw an AOI to view chart stats." }
        }
    }
}

pub fn paint_for_color(color: &str) -> Value {
    match color {
        "green" => json!({ "fill-color": "#4ade80", "line-color": "#22c55e" }),
        "orange" => json!({ "fill-color": "#fb923c", "line-color": "#f97316" }),
        _ => json!({ "fill-color": "#38bdf8", "line-color": "#0ea5e9" }),
    }
}

pub fn ensure_demo_layer(layers: &mut Vec<AddedLayer>) {
    if !layers.iter().any(|l| l.id == DEMO_LAYER_ID) {
        layers.push(AddedLayer {
            id: DEMO_LAYER_ID.into(),
            name: "Demo field".into(),
            kind: LayerKind::Custom,
            visible: false,
            tile_url: None,
        });
    }
}

pub fn persist_layers(tenant_id: &str, layers: &[AddedLayer]) {
    LayerStore::save(tenant_id, layers);
}

pub fn load_layers(tenant_id: &str) -> Vec<AddedLayer> {
    let mut list = LayerStore::load(tenant_id);
    ensure_demo_layer(&mut list);
    list
}

pub fn wms_tile_url() -> Option<String> {
    LayerStore::defaults()
        .into_iter()
        .find(|l| l.id == WMS_LAYER_ID)
        .and_then(|l| l.tile_url)
}
