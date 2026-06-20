//! Toolbox dock panels — Task 31.3–31.15.

use dioxus::prelude::*;
use serde_json::{json, Value};

use super::extended_panels::{
    ChatLine, FieldsPanel, GeoAiPanel, MeasurePanel, PrintPanel, RoutePanel, WeatherPanel,
};
use super::remote_sensing_panel::RemoteSensingPanel;
use crate::gis::{
    index_catalog, index_label_for, resolve_index_id, AddedLayer, AoiRecord, FieldRecord, LayerKind,
    LayerSettings, LayerStore, RemoteSensingSettings, INDEX_RASTER_LAYER_ID,
};
use crate::gis::native::{catalog_entries, polygon_area_km2};

pub const DEMO_LAYER_ID: &str = "demo-field";
pub use crate::gis::INDEX_RASTER_LAYER_ID as WMS_LAYER_ID;

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
    layer_settings: Signal<LayerSettings>,
    rs_settings: Signal<RemoteSensingSettings>,
    draw_tool: Signal<String>,
    timeline_active: Signal<bool>,
    rs_status: Signal<String>,
    basemap_id: String,
    aoi_count: usize,
    aois: Signal<Vec<AoiRecord>>,
    selected_aoi_id: Signal<Option<String>>,
    identify_hits: Signal<Vec<String>>,
    symbology_color: Signal<String>,
    upload_json: Signal<String>,
    draw_points: Signal<usize>,
    on_layers_changed: EventHandler<()>,
    on_settings_changed: EventHandler<()>,
    on_open_tool: EventHandler<String>,
    on_basemap_change: EventHandler<String>,
    on_index_change: EventHandler<String>,
    on_rs_settings_changed: EventHandler<()>,
    on_open_add_data: EventHandler<()>,
    on_set_draw_tool: EventHandler<String>,
    on_generate_timeline: EventHandler<()>,
    on_open_charts: EventHandler<()>,
    on_open_report: EventHandler<()>,
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

    let title = tool_panel_title(&active_tool);
    let mut print_title = use_signal(|| "GeoSyntra map export".to_string());

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
                            layer_settings: layer_settings,
                            basemap_id: basemap_id.clone(),
                            aoi_count: aoi_count,
                            symbology_color: symbology_color,
                            upload_json: upload_json,
                            on_layers_changed: on_layers_changed,
                            on_settings_changed: on_settings_changed,
                            on_add_demo_layer: on_add_demo_layer,
                            on_apply_symbology: on_apply_symbology,
                            on_upload: on_upload,
                            on_open_tool: on_open_tool,
                            on_basemap_change: on_basemap_change,
                            on_index_change: on_index_change,
                            show_upload: active_tool == "add-data",
                        }
                    },
                    "remote-sensing" | "imagery" => rsx! {
                        RemoteSensingPanel {
                            layers: layers,
                            layer_settings: layer_settings,
                            rs_settings: rs_settings,
                            aois: aois,
                            draw_points: draw_points,
                            draw_tool: draw_tool,
                            timeline_active: timeline_active,
                            rs_status: rs_status,
                            on_layers_changed: on_layers_changed,
                            on_sync_wms: on_sync_wms,
                            on_index_change: on_index_change,
                            on_rs_settings_changed: on_rs_settings_changed,
                            on_open_add_data: on_open_add_data,
                            on_start_draw: on_start_draw,
                            on_clear_draw: on_clear_draw,
                            on_set_draw_tool: on_set_draw_tool,
                            on_generate_timeline: on_generate_timeline,
                            on_open_charts: on_open_charts,
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
                    "symbology" => rsx! {
                        div { class: "gs-native-tool-panel__section",
                            span { class: "gs-native-tool-panel__label", "Symbology" }
                            select {
                                class: "gs-native-tool-panel__select",
                                value: "{symbology_color()}",
                                onchange: move |e| on_apply_symbology.call(e.value()),
                                option { value: "blue", "Blue fill" }
                                option { value: "green", "Green fill" }
                                option { value: "orange", "Orange fill" }
                                option { value: "red", "Red fill" }
                                option { value: "purple", "Purple fill" }
                            }
                            p { class: "gs-native-tool-panel__hint",
                                "Classified fill colors for vector overlays on the map."
                            }
                        }
                    },
                    "legend" => rsx! {
                        p { class: "gs-native-tool-panel__hint",
                            "Map legend shows active WMS / index layer symbology. Toggle index visibility in Remote sensing or Layer settings."
                        }
                        ul { class: "gs-native-identify-list",
                            li { "NDVI / index ramp (demo)" }
                            li { "Basemap: Esri imagery" }
                        }
                    },
                    "elev-profile" => rsx! {
                        MeasurePanel {
                            length_m: measure_length_m,
                            point_count: draw_points,
                            on_start: on_start_measure,
                            on_clear: on_clear_measure,
                        }
                        p { class: "gs-native-tool-panel__hint",
                            "Draw a line on the map to sample elevation (demo profile)."
                        }
                    },
                    "explore-indexes" => rsx! {
                        p { class: "gs-native-tool-panel__hint",
                            "Spectral index cards for Layer Live — open Remote sensing to switch the active index."
                        }
                        button {
                            class: "gs-native-tool-panel__btn",
                            r#type: "button",
                            onclick: move |_| on_open_tool.call("remote-sensing".into()),
                            "Open Remote sensing"
                        }
                    },
                    "charts" | "stats" | "quick-dashboard" => rsx! {
                        ChartsPanel {
                            aois: aois,
                            selected_aoi_id: selected_aoi_id,
                            on_open_report: on_open_report,
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
                            title: print_title,
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

pub fn tool_panel_title(tool: &str) -> &'static str {
    match tool {
        "layers" => "Layer settings",
        "add-data" => "Add data",
        "remote-sensing" => "Remote sensing",
        "imagery" => "Imagery",
        "aoi" => "AOI workspace",
        "identify" | "feature" => "Identify",
        "charts" => "Charts",
        "stats" => "Statistics",
        "geo-ai" => "Agent Chat",
        "symbology" => "Symbology",
        "legend" => "Legend",
        "elev-profile" => "Elevation profile",
        "explore-indexes" => "Explore Indexes",
        "quick-dashboard" => "Quick Dashboard",
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
    layer_settings: Signal<LayerSettings>,
    basemap_id: String,
    aoi_count: usize,
    symbology_color: Signal<String>,
    upload_json: Signal<String>,
    on_layers_changed: EventHandler<()>,
    on_settings_changed: EventHandler<()>,
    on_add_demo_layer: EventHandler<()>,
    on_apply_symbology: EventHandler<String>,
    on_upload: EventHandler<()>,
    on_open_tool: EventHandler<String>,
    on_basemap_change: EventHandler<String>,
    on_index_change: EventHandler<String>,
    show_upload: bool,
) -> Element {
    let mut inner_tab = use_signal(|| "main".to_string());

    let basemap_label = catalog_entries()
        .into_iter()
        .find(|e| e.id == basemap_id)
        .map(|e| e.label)
        .unwrap_or_else(|| "Esri World Imagery".into());

    let active_index = resolve_index_id(&layer_settings().active_index_id).to_string();
    let index_visible = layers()
        .iter()
        .find(|l| l.id == INDEX_RASTER_LAYER_ID)
        .map(|l| l.visible)
        .unwrap_or(false);

    let index_meta = if aoi_count > 1 {
        format!("Index raster · {aoi_count} AOIs")
    } else if aoi_count > 0 {
        "Index raster (AOI clip)".into()
    } else {
        "Index raster (draw AOI first)".into()
    };

    let custom_layers: Vec<AddedLayer> = layers()
        .iter()
        .filter(|l| l.kind == LayerKind::Custom)
        .cloned()
        .collect();

    let groups = layer_settings().layer_groups.clone();
    let tab = inner_tab();
    let main_tab_on = tab == "main";
    let options_tab_on = tab == "options";

    rsx! {
        div { class: "gs-native-layers-panel",
            if show_upload {
                div { class: "gs-native-layers-panel__upload",
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
            } else {
                div { class: "gs-native-layers-panel__kicker", "CONTEXT" }

                div {
                    class: "gs-native-layers-panel__tabs",
                    role: "tablist",
                    aria_label: "Layer settings sections",

                    button {
                        class: if tab == "main" {
                            "gs-native-layers-panel__tab gs-native-layers-panel__tab--on"
                        } else {
                            "gs-native-layers-panel__tab"
                        },
                        r#type: "button",
                        role: "tab",
                        aria_selected: "{main_tab_on}",
                        onclick: move |_| inner_tab.set("main".into()),
                        "Main"
                    }
                    button {
                        class: if tab == "options" {
                            "gs-native-layers-panel__tab gs-native-layers-panel__tab--on"
                        } else {
                            "gs-native-layers-panel__tab"
                        },
                        r#type: "button",
                        role: "tab",
                        aria_selected: "{options_tab_on}",
                        onclick: move |_| inner_tab.set("options".into()),
                        "Options"
                    }
                }

                if tab == "main" {
                    div {
                        class: "gs-native-layers-panel__tab-body",
                        role: "tabpanel",

                        div { class: "gs-native-layers-panel__card",
                            div { class: "gs-native-layers-panel__card-head",
                                span { class: "gs-native-layers-panel__card-title", "ADDED LAYERS" }
                                button {
                                    class: "gs-native-layers-panel__group-btn",
                                    r#type: "button",
                                    onclick: move |_| {
                                        let mut settings = layer_settings();
                                        let n = settings.layer_groups.len() + 1;
                                        settings.layer_groups.push(format!("Group {n}"));
                                        layer_settings.set(settings);
                                        on_settings_changed.call(());
                                    },
                                    i { class: "fa-solid fa-folder-plus", aria_hidden: "true" }
                                    " + Group"
                                }
                            }

                            if custom_layers.is_empty() && groups.is_empty() {
                                p { class: "gs-native-layers-panel__empty", "No layers added yet." }
                            } else {
                                for group in groups.iter() {
                                    {
                                        let group_name = group.clone();
                                        let in_group: Vec<_> = custom_layers
                                            .iter()
                                            .filter(|l| l.group_name.as_deref() == Some(group.as_str()))
                                            .collect();
                                        rsx! {
                                            div {
                                                key: "{group_name}",
                                                class: "gs-native-layers-panel__group",
                                                div { class: "gs-native-layers-panel__group-head", "{group_name}" }
                                                if in_group.is_empty() {
                                                    p { class: "gs-native-layers-panel__group-empty", "Empty group" }
                                                } else {
                                                    for layer in in_group {
                                                        AddedLayerRow {
                                                            key: "{layer.id}",
                                                            layer: (*layer).clone(),
                                                            layers: layers,
                                                            on_layers_changed: on_layers_changed,
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                for layer in custom_layers.iter().filter(|l| l.group_name.is_none()) {
                                    AddedLayerRow {
                                        key: "{layer.id}",
                                        layer: layer.clone(),
                                        layers: layers,
                                        on_layers_changed: on_layers_changed,
                                    }
                                }
                            }

                            button {
                                class: "gs-native-tool-panel__btn",
                                r#type: "button",
                                onclick: move |_| on_add_demo_layer.call(()),
                                "Add demo field polygon"
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
                        }
                    }
                } else {
                    div {
                        class: "gs-native-layers-panel__tab-body",
                        role: "tabpanel",

                        div { class: "gs-native-layers-panel__subnav",
                            button {
                                class: "gs-native-layers-panel__subnav-back",
                                r#type: "button",
                                onclick: move |_| inner_tab.set("main".into()),
                                "← Main"
                            }
                            span { class: "gs-native-layers-panel__subnav-crumb", "LAYERS · OPTIONS" }
                        }

                        div { class: "gs-native-layers-panel__opt-actions",
                            button {
                                class: "gs-native-layers-panel__opt-btn",
                                r#type: "button",
                                onclick: move |_| on_open_tool.call("remote-sensing".into()),
                                i { class: "fa-solid fa-satellite-dish", aria_hidden: "true" }
                                " Open Remote sensing"
                            }
                            button {
                                class: "gs-native-layers-panel__opt-btn",
                                r#type: "button",
                                onclick: move |_| on_open_tool.call("geo-ai".into()),
                                i { class: "fa-solid fa-comments", aria_hidden: "true" }
                                " Open Agent Chat"
                            }
                        }

                        div { class: "gs-native-layers-panel__live",
                            div { class: "gs-native-layers-panel__live-title", "Layer live" }

                            ul { class: "gs-native-layers-panel__live-list",
                                li { class: "gs-native-layers-panel__live-row",
                                    div { class: "gs-native-layers-panel__live-main",
                                        span { class: "gs-native-layers-panel__live-label", "{basemap_label}" }
                                        span { class: "gs-native-layers-panel__live-meta", "Base map" }
                                    }
                                    span { class: "gs-native-layers-panel__live-badge", "ON" }
                                }
                                li { class: "gs-native-layers-panel__live-row",
                                    div { class: "gs-native-layers-panel__live-main",
                                        span { class: "gs-native-layers-panel__live-label", "{active_index}" }
                                        span { class: "gs-native-layers-panel__live-meta", "{index_meta}" }
                                    }
                                    button {
                                        class: "gs-native-layers-panel__live-vis",
                                        r#type: "button",
                                        title: if index_visible { "Hide on map" } else { "Show on map" },
                                        aria_pressed: "{index_visible}",
                                        onclick: move |_| {
                                            let mut list = layers();
                                            if let Some(row) = list.iter_mut().find(|l| l.id == INDEX_RASTER_LAYER_ID) {
                                                row.visible = !index_visible;
                                                layers.set(list);
                                                on_layers_changed.call(());
                                            }
                                        },
                                        i {
                                            class: if index_visible {
                                                "fa-solid fa-eye"
                                            } else {
                                                "fa-solid fa-eye-slash"
                                            },
                                            aria_hidden: "true"
                                        }
                                    }
                                }
                            }

                            label { class: "gs-native-layers-panel__field",
                                span { "Basemap style" }
                                select {
                                    value: "{basemap_id}",
                                    aria_label: "Basemap style",
                                    onchange: move |e| on_basemap_change.call(e.value()),
                                    for entry in catalog_entries() {
                                        option {
                                            value: "{entry.id}",
                                            selected: entry.id == basemap_id,
                                            "{entry.label}"
                                        }
                                    }
                                }
                            }

                            label { class: "gs-native-layers-panel__field",
                                span { "Active index layer" }
                                select {
                                    value: "{active_index}",
                                    aria_label: "Active remote sensing index layer",
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
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn AddedLayerRow(
    layer: AddedLayer,
    layers: Signal<Vec<AddedLayer>>,
    on_layers_changed: EventHandler<()>,
) -> Element {
    let id = layer.id.clone();
    let name = layer.name.clone();
    let visible = layer.visible;
    rsx! {
        div {
            class: "gs-native-layers-panel__added-row",
            span { class: "gs-native-layers-panel__added-label", "{name}" }
            button {
                class: "gs-native-layers-panel__live-vis",
                r#type: "button",
                title: if visible { "Hide on map" } else { "Show on map" },
                aria_pressed: "{visible}",
                onclick: move |_| {
                    let mut list = layers();
                    if let Some(row) = list.iter_mut().find(|l| l.id == id) {
                        row.visible = !visible;
                        layers.set(list);
                        on_layers_changed.call(());
                    }
                },
                i {
                    class: if visible {
                        "fa-solid fa-eye"
                    } else {
                        "fa-solid fa-eye-slash"
                    },
                    aria_hidden: "true"
                }
            }
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
fn ChartsPanel(
    aois: Signal<Vec<AoiRecord>>,
    selected_aoi_id: Signal<Option<String>>,
    on_open_report: EventHandler<()>,
) -> Element {
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
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| on_open_report.call(()),
                    "Open vegetation report"
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
            group_name: None,
        });
    }
}

pub fn persist_layers(tenant_id: &str, layers: &[AddedLayer]) {
    LayerStore::save(tenant_id, layers);
}

pub fn persist_layer_settings(tenant_id: &str, settings: &LayerSettings) {
    LayerStore::save_settings(tenant_id, settings);
}

pub fn load_layers(tenant_id: &str) -> Vec<AddedLayer> {
    LayerStore::load(tenant_id)
}

pub fn load_layer_settings(tenant_id: &str) -> LayerSettings {
    LayerStore::load_settings(tenant_id)
}
