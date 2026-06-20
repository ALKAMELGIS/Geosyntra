//! Native Mapbox GIS workspace (Task 31) — 3D globe, toolbox panels, layer sync.

use dioxus::prelude::*;
use serde_json::{json, Value};

use super::{
    aoi_report_modal::AoiReportModal,
    basemap_picker::normalize_basemap_id,
    extended_panels::ChatLine,
    feature_popup::FeaturePopup,
    map_floating_controls::MapFloatingControls,
    map_shell::MapShell,
    map_status_bar::MapPointer,
    print_modal::PrintModal,
    timeline_options_modal::{TimelineOptions, TimelineOptionsModal},
    weather_intel_panel::WeatherIntelPanel,
    tool_panel::{
        demo_field_geojson, load_layer_settings, load_layers, paint_for_color, persist_layer_settings,
        persist_layers, ToolPanel, DEMO_LAYER_ID, WMS_LAYER_ID,
    },
    layer_swipe_panel::{sync_swipe, SwipeState},
};
use crate::gis::RemoteSensingStore;
use crate::{
    api::{
        ai::chat::send_chat,
        gis::geocode::{search_places, GeocodeHit},
        gis::open_meteo::demo_weather_at,
        settings::config::fetch_mapbox_config,
    },
    auth_session::AuthContext,
    components::{AppNavBar, AppNavSection},
    gis::{
        aoi_bounds, list_aois, load_fields, set_layer_preset, upsert_aoi_from_geojson, AddedLayer,
        build_aoi_vegetation_report, build_weekly_timeline, identify_at_point,
        AoiRecord, AoiVegetationReport, BuildReportInput, FieldRecord, IdentifyHit, LayerKind,
        LayerSettings, PrintPageSpec, RemoteSensingSettings, ReportIndexId, SymbologyPreset,
        TimelineWeekInput,
        wms_tile_url_for_index,
        native::{
            resolve_gl_access_token, mapbox_light_for_minutes, merge_terrain_underlay, MapboxBridge,
            MapCreateOptions, MapHandle, DaylightSettings, PROJECTION_GLOBE, PROJECTION_MERCATOR,
            DEFAULT_BASEMAP_ID, MAP_CONTAINER_ID, style_for_basemap,
        },
    },
    routes::Route,
};

fn aoi_layer_id(aoi_id: &str) -> String {
    format!("aoi-{aoi_id}")
}

fn field_layer_id(field_id: &str) -> String {
    format!("field-{field_id}")
}

fn resolve_wms_tile_url(
    index_id: &str,
    rs: &RemoteSensingSettings,
    aois: &[AoiRecord],
    timeline_active: bool,
) -> String {
    let aoi_geo = aois.first().map(|a| &a.geojson);
    wms_tile_url_for_index(index_id, rs, aoi_geo, timeline_active)
}

fn sync_map_layers(
    handle: &MapHandle,
    layers: &[AddedLayer],
    aois: &[AoiRecord],
    fields: &[FieldRecord],
    sym_color: &str,
    active_index_id: &str,
    rs: &RemoteSensingSettings,
    timeline_active: bool,
) {
    let paint = paint_for_color(sym_color);

    if let Some(demo) = layers.iter().find(|l| l.id == DEMO_LAYER_ID) {
        MapboxBridge::add_geojson_layer(handle, DEMO_LAYER_ID, &demo_field_geojson(), &paint);
        MapboxBridge::set_layer_visibility(handle, DEMO_LAYER_ID, demo.visible);
    }

    if let Some(wms) = layers.iter().find(|l| l.id == WMS_LAYER_ID) {
        if wms.visible {
            let url = resolve_wms_tile_url(active_index_id, rs, aois, timeline_active);
            MapboxBridge::add_raster_layer(handle, WMS_LAYER_ID, &[url], 0.85);
        } else {
            MapboxBridge::set_layer_visibility(handle, WMS_LAYER_ID, false);
        }
    }

    for aoi in aois {
        let lid = aoi_layer_id(&aoi.id);
        let aoi_paint = json!({
            "fill-color": "#4ade80",
            "fill-opacity": 0.22,
            "line-color": "#22c55e",
        });
        MapboxBridge::add_geojson_layer(handle, &lid, &aoi.geojson, &aoi_paint);
        MapboxBridge::set_layer_visibility(handle, &lid, true);
    }

    for field in fields {
        let lid = field_layer_id(&field.id);
        let field_paint = json!({
            "fill-color": "#a78bfa",
            "fill-opacity": 0.18,
            "line-color": "#8b5cf6",
        });
        MapboxBridge::add_geojson_layer(handle, &lid, &field.geojson, &field_paint);
        MapboxBridge::set_layer_visibility(handle, &lid, true);
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn download_png(data_url: &str) {
    use wasm_bindgen::JsCast;
    if let Some(window) = web_sys::window() {
        if let Some(document) = window.document() {
            if let Ok(el) = document.create_element("a") {
                let _ = el.set_attribute("href", data_url);
                let _ = el.set_attribute("download", "geosyntra-map.png");
                if let Ok(anchor) = el.dyn_into::<web_sys::HtmlAnchorElement>() {
                    anchor.click();
                }
            }
        }
    }
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn download_png(_data_url: &str) {}

#[component]
pub fn NativeSatelliteWorkspace() -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();
    let session = auth.session.read().clone();
    let signed_in = session.is_signed_in();
    let tenant_id = session.tenant_id.clone().unwrap_or_else(|| "default".into());
    let email = session
        .email
        .clone()
        .unwrap_or_else(|| "anonymous@local".into());

    let mut basemap_id = use_signal(|| DEFAULT_BASEMAP_ID.to_string());
    let mut basemap_open = use_signal(|| false);
    let mut active_tool = use_signal(String::new);
    let mut toolbox_open = use_signal(|| false);
    let mut toolbox_pinned = use_signal(|| false);
    let mut globe_mode = use_signal(|| true);
    let mut map_handle = use_signal(|| None::<MapHandle>);
    let mut map_ready = use_signal(|| false);
    let mut map_error = use_signal(|| None::<String>);
    let mut pointer = use_signal(|| None::<MapPointer>);
    let mut projection_label = use_signal(|| "3D Scene".to_string());
    let mut gl_access_token = use_signal(|| resolve_gl_access_token(None));

    let mut layers = use_signal(|| load_layers(&tenant_id));
    let mut layer_settings = use_signal(|| load_layer_settings(&tenant_id));
    let mut rs_settings = use_signal(|| RemoteSensingStore::load(&tenant_id));
    let mut draw_tool = use_signal(|| "view".to_string());
    let mut timeline_active = use_signal(|| false);
    let mut rs_status = use_signal(String::new);
    let mut swipe_active = use_signal(|| false);
    let mut swipe_state = use_signal(SwipeState::default);
    let mut weather_intel_active = use_signal(|| false);
    let mut float_rail_visible = use_signal(|| true);
    let mut aois = use_signal(|| list_aois(&tenant_id, &email));
    let mut selected_aoi_id = use_signal(|| None::<String>);
    let mut identify_hits = use_signal(Vec::<IdentifyHit>::new);
    let mut symbology_color = use_signal(|| "blue".to_string());
    let mut upload_json = use_signal(String::new);
    let mut draw_points = use_signal(|| 0_usize);
    let mut measure_length_m = use_signal(|| 0.0_f64);

    let mut geo_ai_messages = use_signal(Vec::<ChatLine>::new);
    let mut geo_ai_draft = use_signal(String::new);
    let mut geo_ai_busy = use_signal(|| false);
    let mut geo_ai_error = use_signal(|| None::<String>);

    let mut weather_enabled = use_signal(|| false);
    let mut weather_summary = use_signal(String::new);
    let mut export_status = use_signal(|| None::<String>);

    let mut report_open = use_signal(|| false);
    let mut aoi_report = use_signal(|| None::<AoiVegetationReport>);

    let mut daylight_settings = use_signal(DaylightSettings::default);
    let mut terrain_enabled = use_signal(|| false);

    let mut timeline_options_open = use_signal(|| false);
    let mut timeline_options = use_signal(TimelineOptions::default);
    let mut print_modal_open = use_signal(|| false);
    let mut print_spec = use_signal(PrintPageSpec::default);
    let mut weather_snapshot = use_signal(|| None::<crate::api::gis::open_meteo::WeatherSnapshot>);

    let mut fields = use_signal(|| load_fields(&tenant_id));
    let mut selected_field_id = use_signal(|| None::<String>);

    let mut search_open = use_signal(|| false);
    let mut search_query = use_signal(String::new);
    let mut search_hits = use_signal(Vec::<GeocodeHit>::new);
    let mut search_busy = use_signal(|| false);

    let session_gate = session.clone();
    use_effect(move || {
        if !session_gate.is_signed_in() {
            let _ = nav.replace(Route::Login {});
        } else if !session_gate.has_permission("app.access") || !session_gate.has_permission("aoi.read")
        {
            let _ = nav.replace(Route::Landing {});
        }
    });

    use_future(move || async move {
        if let Ok(cfg) = fetch_mapbox_config().await {
            if let Some(pk) = cfg.public_token.as_deref().filter(|t| t.starts_with("pk.")) {
                gl_access_token.set(pk.to_string());
            }
        }
    });

    use_effect(move || {
        if !MapboxBridge::is_available() {
            map_error.set(Some(
                "Mapbox GL bridge not loaded — check index.html scripts.".into(),
            ));
            return;
        }
        if map_handle.read().is_some() {
            return;
        }

        let mut opts = MapCreateOptions::default();
        opts.access_token = Some(gl_access_token.read().clone());
        opts.style = style_for_basemap(DEFAULT_BASEMAP_ID);

        if let Some(handle) = MapboxBridge::create(MAP_CONTAINER_ID, &opts) {
            map_handle.set(Some(handle));
            map_ready.set(true);
            map_error.set(None);
        } else {
            map_error.set(Some("Failed to create map.".into()));
        }
    });

    use_drop(move || {
        if let Some(h) = map_handle.read().clone() {
            MapboxBridge::destroy(&h);
        }
    });

    use_effect({
        let basemap = basemap_id();
        let terrain = terrain_enabled();
        move || {
            if let Some(handle) = map_handle.read().clone() {
                let style = style_for_basemap(&basemap);
                let style = if terrain {
                    merge_terrain_underlay(&style)
                } else {
                    style
                };
                MapboxBridge::set_style(&handle, &style);
            }
        }
    });

    use_effect({
        let dl = daylight_settings();
        move || {
            if !dl.sun_by_datetime {
                return;
            }
            if let Some(handle) = map_handle.read().clone() {
                let light = mapbox_light_for_minutes(dl.minutes);
                MapboxBridge::set_light(&handle, &light);
            }
        }
    });

    use_effect({
        let layer_list = layers();
        let aoi_list = aois();
        let field_list = fields();
        let color = symbology_color();
        let index_id = layer_settings().active_index_id.clone();
        let rs = rs_settings();
        let timeline = timeline_active();
        move || {
            if !*map_ready.read() {
                return;
            }
            if let Some(handle) = map_handle.read().clone() {
                sync_map_layers(
                    &handle,
                    &layer_list,
                    &aoi_list,
                    &field_list,
                    &color,
                    &index_id,
                    &rs,
                    timeline,
                );
            }
        }
    });

    use_effect(move || {
        if !weather_enabled() {
            return;
        }
        if let Some(p) = pointer() {
            let snap = demo_weather_at(p.lat, p.lng);
            weather_summary.set(snap.summary.clone());
            weather_snapshot.set(Some(snap));
        } else {
            weather_summary.set("Move pointer over map for demo forecast.".into());
        }
    });

    use_effect(move || {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            use wasm_bindgen::prelude::*;
            use wasm_bindgen::JsCast;

            let read_f64 = |obj: &js_sys::Object, key: &str| -> f64 {
                js_sys::Reflect::get(obj, &key.into())
                    .ok()
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
            };

            let on_resize = Closure::wrap(Box::new(move || {
                if let Some(handle) = map_handle.read().clone() {
                    MapboxBridge::resize(&handle);
                }
            }) as Box<dyn FnMut()>);

            let on_pointer = Closure::wrap(Box::new(move |event: web_sys::Event| {
                if let Some(target) = event.target() {
                    if let Ok(custom) = target.dyn_into::<web_sys::CustomEvent>() {
                        if let Some(detail) = custom.detail().dyn_ref::<js_sys::Object>() {
                            pointer.set(Some(MapPointer {
                                lng: read_f64(detail, "lng"),
                                lat: read_f64(detail, "lat"),
                            }));
                        }
                    }
                }
            }) as Box<dyn FnMut(_)>);

            let on_move = Closure::wrap(Box::new(move |event: web_sys::Event| {
                if let Some(target) = event.target() {
                    if let Ok(custom) = target.dyn_into::<web_sys::CustomEvent>() {
                        if let Some(detail) = custom.detail().dyn_ref::<js_sys::Object>() {
                            let proj = js_sys::Reflect::get(detail, &"projection".into())
                                .ok()
                                .and_then(|v| v.as_string())
                                .unwrap_or_default();
                            projection_label.set(if proj == "globe" {
                                "3D Scene".into()
                            } else {
                                "2D Map".into()
                            });
                            globe_mode.set(proj == "globe");
                        }
                    }
                }
            }) as Box<dyn FnMut(_)>);

            let on_draw = Closure::wrap(Box::new(move |event: web_sys::Event| {
                if let Some(target) = event.target() {
                    if let Ok(custom) = target.dyn_into::<web_sys::CustomEvent>() {
                        if let Some(detail) = custom.detail().dyn_ref::<js_sys::Object>() {
                            let count = js_sys::Reflect::get(detail, &"pointCount".into())
                                .ok()
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0) as usize;
                            draw_points.set(count);
                            let len = js_sys::Reflect::get(detail, &"lengthM".into())
                                .ok()
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0);
                            measure_length_m.set(len);
                        }
                    }
                }
            }) as Box<dyn FnMut(_)>);

            let on_click = Closure::wrap(Box::new(move |event: web_sys::Event| {
                let tool = active_tool();
                if tool != "identify" && tool != "feature" {
                    return;
                }
                if let Some(target) = event.target() {
                    if let Ok(custom) = target.dyn_into::<web_sys::CustomEvent>() {
                        if let Some(detail) = custom.detail().dyn_ref::<js_sys::Object>() {
                            let features_val = js_sys::Reflect::get(detail, &"features".into())
                                .unwrap_or(wasm_bindgen::JsValue::NULL);
                            if let Ok(arr) = features_val.dyn_into::<js_sys::Array>() {
                                let mut lines = Vec::new();
                                for i in 0..arr.length() {
                                    if let Ok(f) = arr.get(i).dyn_into::<js_sys::Object>() {
                                        let layer = js_sys::Reflect::get(&f, &"layer".into())
                                            .ok()
                                            .and_then(|v| v.as_string())
                                            .unwrap_or_else(|| "layer".into());
                                        let props = js_sys::Reflect::get(&f, &"properties".into()).ok();
                                        let label = props
                                            .as_ref()
                                            .and_then(|p| {
                                                js_sys::Reflect::get(p, &"name".into())
                                                    .ok()
                                                    .and_then(|v| v.as_string())
                                            })
                                            .unwrap_or_else(|| "feature".into());
                                        lines.push(format!("{layer}: {label}"));
                                    }
                                }
                                if lines.is_empty() {
                                    lines.push("No vector features at click.".into());
                                }
                                identify_hits.set(lines);
                            }
                        }
                    }
                }
            }) as Box<dyn FnMut(_)>);

            if let Some(window) = web_sys::window() {
                let _ = window.add_event_listener_with_callback("resize", on_resize.as_ref().unchecked_ref());
                let _ = window.add_event_listener_with_callback(
                    "geosyntra-map-pointer",
                    on_pointer.as_ref().unchecked_ref(),
                );
                let _ = window.add_event_listener_with_callback(
                    "geosyntra-map-moveend",
                    on_move.as_ref().unchecked_ref(),
                );
                let _ = window.add_event_listener_with_callback(
                    "geosyntra-map-draw-change",
                    on_draw.as_ref().unchecked_ref(),
                );
                let _ = window.add_event_listener_with_callback(
                    "geosyntra-map-click",
                    on_click.as_ref().unchecked_ref(),
                );
            }
            on_resize.forget();
            on_pointer.forget();
            on_move.forget();
            on_draw.forget();
            on_click.forget();
        }
    });

    let zoom_in = move |_| {
        if let Some(h) = map_handle.read().clone() {
            MapboxBridge::zoom_by(&h, 1.0);
        }
    };
    let zoom_out = move |_| {
        if let Some(h) = map_handle.read().clone() {
            MapboxBridge::zoom_by(&h, -1.0);
        }
    };
    let go_home = move |_| {
        if let Some(h) = map_handle.read().clone() {
            MapboxBridge::go_home(&h);
        }
    };
    let toggle_projection = move |_| {
        if let Some(h) = map_handle.read().clone() {
            let next = if *globe_mode.read() {
                PROJECTION_MERCATOR
            } else {
                PROJECTION_GLOBE
            };
            MapboxBridge::set_projection(&h, next);
            globe_mode.set(next == PROJECTION_GLOBE);
            projection_label.set(if next == PROJECTION_GLOBE {
                "3D Scene".into()
            } else {
                "2D Map".into()
            });
        }
    };

    let tenant_for_layers = tenant_id.clone();
    let on_layers_changed = move |_| {
        persist_layers(&tenant_for_layers, &layers());
        if let Some(handle) = map_handle.read().clone() {
            sync_map_layers(
                &handle,
                &layers(),
                &aois(),
                &fields(),
                &symbology_color(),
                &layer_settings().active_index_id,
                &rs_settings(),
                timeline_active(),
            );
        }
    };

    let tenant_for_settings = tenant_id.clone();
    let on_settings_changed = move |_| {
        persist_layer_settings(&tenant_for_settings, &layer_settings());
    };

    let tenant_rs = tenant_id.clone();
    let on_rs_settings_changed = move |_| {
        RemoteSensingStore::save(&tenant_rs, &rs_settings());
    };

    let on_open_add_data = move |_| active_tool.set("add-data".into());

    let on_set_draw_tool = move |tool: String| {
        draw_tool.set(tool.clone());
        if let Some(handle) = map_handle.read().clone() {
            match tool.as_str() {
                "polygon" => MapboxBridge::set_draw_mode(&handle, "polygon"),
                "line" => MapboxBridge::set_draw_mode(&handle, "line"),
                _ => MapboxBridge::set_draw_mode(&handle, "none"),
            }
        }
    };

    let on_generate_timeline = move |_| {
        if timeline_active() {
            timeline_active.set(false);
            rs_status.set("Timeline stopped. Adjust the date range and tap Generate timeline to start again.".into());
            return;
        }
        if aois().is_empty() {
            rs_status.set("Draw or upload an AOI first, then generate timeline.".into());
            return;
        }
        timeline_active.set(true);
        let start = rs_settings().time_series_start.clone();
        let end = rs_settings().time_series_end.clone();
        rs_status.set(format!(
            "Timeline ready · {start} → {end} (demo — open Charts for AOI stats)."
        ));
    };

    let on_open_charts = move |_| active_tool.set("charts".into());

    let on_open_report = move |_| {
        let aoi = selected_aoi_id()
            .and_then(|id| aois().into_iter().find(|a| a.id == id))
            .or_else(|| aois().first().cloned());
        let Some(rec) = aoi else {
            rs_status.set("Draw or select an AOI before opening the report.".into());
            return;
        };
        let rs = rs_settings();
        let weeks: Vec<TimelineWeekInput> = build_weekly_timeline(
            &rs.time_series_start,
            &rs.time_series_end,
        )
        .into_iter()
        .map(|w| TimelineWeekInput {
            start_date: w.start_date,
            end_date: w.end_date,
            mean: w.mean,
        })
        .collect();
        let index = match layer_settings().active_index_id.as_str() {
            "NDWI" => ReportIndexId::Ndwi,
            "SAVI" => ReportIndexId::Savi,
            "LST" => ReportIndexId::Lst,
            _ => ReportIndexId::Ndvi,
        };
        if let Some(report) = build_aoi_vegetation_report(&BuildReportInput {
            index_id: index,
            date_start: &rs.time_series_start,
            date_end: &rs.time_series_end,
            aoi_name: &rec.name,
            aoi_feature: &rec.geojson,
            weekly: &weeks,
        }) {
            aoi_report.set(Some(report));
            report_open.set(true);
        }
    };

    let on_close_report = move |_| report_open.set(false);

    let on_daylight_change = move |settings: DaylightSettings| {
        daylight_settings.set(settings);
    };

    let on_toggle_terrain = move |enabled: bool| {
        terrain_enabled.set(enabled);
    };

    let on_toggle_swipe = move |_| {
        let next = !swipe_active();
        swipe_active.set(next);
        swipe_state.with_mut(|st| st.active = next);
        if let Some(handle) = map_handle.read().clone() {
            sync_swipe(Some(&handle.id), &swipe_state());
        }
    };

    let on_swipe_close = move |_| {
        swipe_active.set(false);
        swipe_state.with_mut(|st| st.active = false);
        if let Some(handle) = map_handle.read().clone() {
            sync_swipe(Some(&handle.id), &swipe_state());
        }
    };

    let on_toolbox_toggle = move |_| toolbox_open.set(!toolbox_open());
    let on_toolbox_pin = move |pinned: bool| toolbox_pinned.set(pinned);

    let tenant_index = tenant_id.clone();
    let on_toggle_index = move |_| {
        let mut list = layers();
        if let Some(row) = list.iter_mut().find(|l| l.id == WMS_LAYER_ID) {
            row.visible = !row.visible;
            let visible = row.visible;
            layers.set(list.clone());
            persist_layers(&tenant_index, &list);
            if let Some(handle) = map_handle.read().clone() {
                if visible {
                    let url = resolve_wms_tile_url(
                        &layer_settings().active_index_id,
                        &rs_settings(),
                        &aois(),
                        timeline_active(),
                    );
                    MapboxBridge::add_raster_layer(&handle, WMS_LAYER_ID, &[url], 0.85);
                } else {
                    MapboxBridge::set_layer_visibility(&handle, WMS_LAYER_ID, false);
                }
            }
        }
    };

    let on_toggle_weather_intel = move |_| weather_intel_active.set(!weather_intel_active());
    let on_open_remote_sensing_float = move |_| {
        toolbox_open.set(true);
        active_tool.set("remote-sensing".into());
    };
    let on_tool_panel_close = move |_| active_tool.set(String::new());
    let on_float_rail_close = move |_| float_rail_visible.set(false);
    let on_float_rail_open = move |_| float_rail_visible.set(true);

    let tenant_demo = tenant_id.clone();
    let on_add_demo_layer = move |_| {
        let mut list = layers();
        if let Some(row) = list.iter_mut().find(|l| l.id == DEMO_LAYER_ID) {
            row.visible = true;
        } else {
            list.push(AddedLayer {
                id: DEMO_LAYER_ID.into(),
                name: "Demo field".into(),
                kind: LayerKind::Custom,
                visible: true,
                tile_url: None,
                group_name: None,
            });
        }
        layers.set(list.clone());
        persist_layers(&tenant_demo, &list);
        if let Some(handle) = map_handle.read().clone() {
            let paint = paint_for_color(&symbology_color());
            MapboxBridge::add_geojson_layer(&handle, DEMO_LAYER_ID, &demo_field_geojson(), &paint);
            MapboxBridge::set_layer_visibility(&handle, DEMO_LAYER_ID, true);
            if let Some([w, s, e, n]) = aoi_bounds(&demo_field_geojson()) {
                MapboxBridge::fit_bounds(&handle, w, s, e, n);
            }
        }
    };

    let on_sync_wms = move |visible: bool| {
        if let Some(handle) = map_handle.read().clone() {
            if visible {
                let url = resolve_wms_tile_url(
                    &layer_settings().active_index_id,
                    &rs_settings(),
                    &aois(),
                    timeline_active(),
                );
                MapboxBridge::add_raster_layer(&handle, WMS_LAYER_ID, &[url], 0.85);
            } else {
                MapboxBridge::set_layer_visibility(&handle, WMS_LAYER_ID, false);
            }
        }
    };

    let on_open_tool = move |tool_id: String| active_tool.set(tool_id);

    let on_basemap_change = move |id: String| {
        basemap_id.set(normalize_basemap_id(&id));
    };

    let tenant_index = tenant_id.clone();
    let on_index_change = move |index_id: String| {
        let resolved = crate::gis::resolve_index_id(&index_id).to_string();
        let label = crate::gis::index_label_for(&resolved);
        layer_settings.with_mut(|s| s.active_index_id = resolved.clone());
        layers.with_mut(|list| {
            if let Some(row) = list.iter_mut().find(|l| l.id == WMS_LAYER_ID) {
                row.name = label;
            }
        });
        persist_layer_settings(&tenant_index, &layer_settings());
        persist_layers(&tenant_index, &layers());
        if let Some(handle) = map_handle.read().clone() {
            if layers()
                .iter()
                .find(|l| l.id == WMS_LAYER_ID)
                .map(|l| l.visible)
                .unwrap_or(false)
            {
                let url = resolve_wms_tile_url(
                    &resolved,
                    &rs_settings(),
                    &aois(),
                    timeline_active(),
                );
                MapboxBridge::add_raster_layer(&handle, WMS_LAYER_ID, &[url], 0.85);
            }
        }
    };

    let on_start_draw = move |_| {
        draw_tool.set("polygon".into());
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::set_draw_mode(&handle, "polygon");
            draw_points.set(0);
        }
    };
    let on_clear_draw = move |_| {
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::clear_draw(&handle);
            draw_points.set(0);
        }
    };

    let tenant_aoi = tenant_id.clone();
    let email_aoi = email.clone();
    let on_finish_draw = move |_| {
        let Some(handle) = map_handle.read().clone() else {
            return;
        };
        if let Some(feature) = MapboxBridge::finish_draw_polygon(&handle) {
            let name = format!("AOI {}", aois().len() + 1);
            let rec = upsert_aoi_from_geojson(&tenant_aoi, &email_aoi, &name, &feature);
            let updated = list_aois(&tenant_aoi, &email_aoi);
            aois.set(updated);
            selected_aoi_id.set(Some(rec.id.clone()));
            draw_points.set(0);
            sync_map_layers(
                &handle,
                &layers(),
                &aois(),
                &fields(),
                &symbology_color(),
                &layer_settings().active_index_id,
                &rs_settings(),
                timeline_active(),
            );
            if let Some([w, s, e, n]) = aoi_bounds(&feature) {
                MapboxBridge::fit_bounds(&handle, w, s, e, n);
            }
        }
    };

    let on_apply_symbology = {
        let tenant_sym = tenant_id.clone();
        move |color: String| {
            symbology_color.set(color.clone());
            set_layer_preset(&tenant_sym, DEMO_LAYER_ID, SymbologyPreset::parse(&color));
            if let Some(handle) = map_handle.read().clone() {
                MapboxBridge::set_layer_paint(&handle, DEMO_LAYER_ID, &paint_for_color(&color));
            }
        }
    };

    let tenant_upload = tenant_id.clone();
    let on_upload = move |_| {
        let raw = upload_json.read().trim().to_string();
        if raw.is_empty() {
            return;
        }
        let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
            return;
        };
        let id = format!("upload-{}", crate::wall_clock::now_ms());
        let mut list = layers();
        list.push(AddedLayer {
            id: id.clone(),
            name: "Uploaded feature".into(),
            kind: LayerKind::Custom,
            visible: true,
            tile_url: None,
            group_name: None,
        });
        layers.set(list.clone());
        persist_layers(&tenant_upload, &list);
        if let Some(handle) = map_handle.read().clone() {
            let paint = paint_for_color(&symbology_color());
            MapboxBridge::add_geojson_layer(&handle, &id, &parsed, &paint);
            if let Some([w, s, e, n]) = aoi_bounds(&parsed) {
                MapboxBridge::fit_bounds(&handle, w, s, e, n);
            }
        }
        upload_json.set(String::new());
    };

    let on_start_measure = move |_| {
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::set_draw_mode(&handle, "line");
            draw_points.set(0);
            measure_length_m.set(0.0);
        }
    };
    let on_clear_measure = move |_| {
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::clear_draw(&handle);
            draw_points.set(0);
            measure_length_m.set(0.0);
        }
    };
    let on_start_route = move |_| {
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::set_draw_mode(&handle, "line");
            draw_points.set(0);
            measure_length_m.set(0.0);
        }
    };
    let on_clear_route = move |_| {
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::clear_draw(&handle);
            draw_points.set(0);
            measure_length_m.set(0.0);
        }
    };

    let on_toggle_weather = move |on: bool| weather_enabled.set(on);
    let on_toggle_weather_map = move |_| weather_enabled.set(!weather_enabled());

    let on_export_print = move |_| {
        if let Some(handle) = map_handle.read().clone() {
            if let Some(data_url) = MapboxBridge::export_map_png(&handle) {
                download_png(&data_url);
                export_status.set(Some("Map PNG downloaded.".into()));
            } else {
                export_status.set(Some("Export failed — try again after map loads.".into()));
            }
        }
    };

    let on_field_select = move |id: String| {
        selected_field_id.set(Some(id.clone()));
        if let Some(field) = fields().into_iter().find(|f| f.id == id) {
            if let Some(handle) = map_handle.read().clone() {
                if let Some([w, s, e, n]) = aoi_bounds(&field.geojson) {
                    MapboxBridge::fit_bounds(&handle, w, s, e, n);
                }
            }
        }
    };

    let token_geo = session.bearer().map(str::to_string);
    let on_geo_ai_send = move |_| {
        let text = geo_ai_draft.read().trim().to_string();
        if text.is_empty() || *geo_ai_busy.read() {
            return;
        }
        let ctx = pointer.read().as_ref().map(|p| {
            format!(
                "[Map context: {:.4}°, {:.4}° · tool={}]",
                p.lat,
                p.lng,
                active_tool()
            )
        });
        let user_line = if let Some(c) = ctx {
            format!("{c}\n{text}")
        } else {
            text.clone()
        };
        let mut msgs = geo_ai_messages();
        msgs.push(ChatLine {
            role: "user".into(),
            text: text.clone(),
        });
        geo_ai_messages.set(msgs);
        geo_ai_draft.set(String::new());
        geo_ai_busy.set(true);
        geo_ai_error.set(None);
        let token = token_geo.clone();
        spawn(async move {
            match send_chat(&user_line, token.as_deref()).await {
                Ok(resp) => {
                    geo_ai_messages.with_mut(|m| {
                        m.push(ChatLine {
                            role: "model".into(),
                            text: resp.reply,
                        });
                    });
                }
                Err(err) => geo_ai_error.set(Some(err.user_message())),
            }
            geo_ai_busy.set(false);
        });
    };

    let on_search = move |_| {
        let q = search_query.read().trim().to_string();
        if q.len() < 2 {
            return;
        }
        search_busy.set(true);
        spawn(async move {
            match search_places(&q).await {
                Ok(list) => search_hits.set(list),
                Err(_) => search_hits.set(Vec::new()),
            }
            search_busy.set(false);
        });
    };

    let on_search_pick = move |(lng, lat, label): (f64, f64, String)| {
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::fly_to(&handle, lng, lat, 10.0);
            MapboxBridge::set_search_marker(&handle, lng, lat, &label);
        }
        search_open.set(false);
    };

    let tenant_reload = tenant_id.clone();
    let email_reload = email.clone();
    let on_aois_changed = move |_| {
        aois.set(list_aois(&tenant_reload, &email_reload));
    };

    if !signed_in
        || !session.has_permission("app.access")
        || !session.has_permission("aoi.read")
    {
        return rsx! {
            div { class: "gs-gis-gate", p { "Sign in to open the GeoAI workspace." } }
        };
    }

    rsx! {
        div { class: "gs-gis-page gs-gis-page--native si-page si-page--map-canvas",
            AppNavBar {
                active: AppNavSection::GeoAi,
                subtitle: Some("Satellite intelligence".into()),
            }

            MapShell {
                active_tool: active_tool(),
                map_ready: *map_ready.read(),
                map_error: map_error.read().clone(),
                gl_access_token: gl_access_token(),
                viewport_density: "comfortable".to_string(),
                pointer: pointer.read().clone(),
                projection_label: projection_label(),
                on_tool_select: move |id: String| {
                    toolbox_open.set(true);
                    if active_tool() == id {
                        active_tool.set(String::new());
                    } else {
                        active_tool.set(id);
                    }
                },
                toolbox_open: toolbox_open(),
                toolbox_pinned: toolbox_pinned(),
                on_toolbox_toggle: on_toolbox_toggle,
                on_toolbox_pin: on_toolbox_pin,
                swipe_active: swipe_active(),
                swipe_state: swipe_state,
                map_handle_id: map_handle.read().as_ref().map(|h| h.id.clone()),
                on_toggle_swipe: on_toggle_swipe,
                on_swipe_close: on_swipe_close,
                on_tool_panel_close: on_tool_panel_close,
                float_rail_visible: float_rail_visible(),
                on_float_rail_close: on_float_rail_close,
                on_float_rail_open: on_float_rail_open,
                on_zoom_in: zoom_in,
                on_zoom_out: zoom_out,
                on_go_home: go_home,
                floating_controls: rsx! {
                    MapFloatingControls {
                        basemap_id: basemap_id(),
                        basemap_open: *basemap_open.read(),
                        globe_mode: *globe_mode.read(),
                        index_visible: layers()
                            .iter()
                            .find(|l| l.id == WMS_LAYER_ID)
                            .map(|l| l.visible)
                            .unwrap_or(false),
                        weather_open: weather_enabled(),
                        weather_intel_active: weather_intel_active(),
                        swipe_active: swipe_active(),
                        search_open: *search_open.read(),
                        search_query: search_query,
                        search_hits: search_hits,
                        search_busy: search_busy,
                        on_basemap_toggle: move |_| basemap_open.set(!basemap_open()),
                        on_basemap_select: move |id: String| {
                            basemap_id.set(normalize_basemap_id(&id));
                            basemap_open.set(false);
                        },
                        on_toggle_projection: toggle_projection,
                        on_toggle_index: on_toggle_index,
                        on_toggle_weather: on_toggle_weather_map,
                        on_toggle_weather_intel: on_toggle_weather_intel,
                        on_toggle_swipe: on_toggle_swipe,
                        on_open_remote_sensing: on_open_remote_sensing_float,
                        on_search_toggle: move |_| search_open.set(!search_open()),
                        on_search_query: move |q: String| search_query.set(q),
                        on_search: on_search,
                        on_search_pick: on_search_pick,
                        visible: float_rail_visible(),
                        on_close: on_float_rail_close,
                    }
                },
                tool_panel: rsx! {
                    ToolPanel {
                        active_tool: active_tool(),
                        layers: layers,
                        layer_settings: layer_settings,
                        rs_settings: rs_settings,
                        draw_tool: draw_tool,
                        timeline_active: timeline_active,
                        rs_status: rs_status,
                        basemap_id: basemap_id(),
                        aoi_count: aois().len(),
                        aois: aois,
                        selected_aoi_id: selected_aoi_id,
                        identify_hits: identify_hits,
                        symbology_color: symbology_color,
                        upload_json: upload_json,
                        draw_points: draw_points,
                        on_layers_changed: on_layers_changed,
                        on_settings_changed: on_settings_changed,
                        on_open_tool: on_open_tool,
                        on_basemap_change: on_basemap_change,
                        on_index_change: on_index_change,
                        on_rs_settings_changed: on_rs_settings_changed,
                        on_open_add_data: on_open_add_data,
                        on_set_draw_tool: on_set_draw_tool,
                        on_generate_timeline: on_generate_timeline,
                        on_open_charts: on_open_charts,
                        on_open_report: on_open_report,
                        daylight_settings: daylight_settings,
                        terrain_enabled: terrain_enabled,
                        on_daylight_change: on_daylight_change,
                        on_toggle_terrain: on_toggle_terrain,
                        on_aois_changed: on_aois_changed,
                        on_add_demo_layer: on_add_demo_layer,
                        on_sync_wms: on_sync_wms,
                        on_start_draw: on_start_draw,
                        on_finish_draw: on_finish_draw,
                        on_clear_draw: on_clear_draw,
                        on_apply_symbology: on_apply_symbology,
                        on_upload: on_upload,
                        geo_ai_messages: geo_ai_messages,
                        geo_ai_draft: geo_ai_draft,
                        geo_ai_busy: geo_ai_busy,
                        geo_ai_error: geo_ai_error,
                        on_geo_ai_send: on_geo_ai_send,
                        measure_length_m: measure_length_m,
                        on_start_measure: on_start_measure,
                        on_clear_measure: on_clear_measure,
                        on_start_route: on_start_route,
                        on_clear_route: on_clear_route,
                        weather_summary: weather_summary,
                        weather_enabled: weather_enabled,
                        on_toggle_weather: on_toggle_weather,
                        on_export_print: on_export_print,
                        export_status: export_status,
                        fields: fields,
                        selected_field_id: selected_field_id,
                        on_field_select: on_field_select,
                    }
                },
            }

            AoiReportModal {
                open: report_open(),
                report: aoi_report.read().clone(),
                on_close: on_close_report,
            }

            TimelineOptionsModal {
                open: timeline_options_open(),
                options: timeline_options,
                on_apply: move |opts| timeline_options.set(opts),
                on_close: move |_| timeline_options_open.set(false),
            }

            PrintModal {
                open: print_modal_open(),
                spec: print_spec,
                map_png: export_status.read().clone(),
                on_print: on_export_print,
                on_close: move |_| print_modal_open.set(false),
            }

            if weather_intel_active() {
                WeatherIntelPanel {
                    snapshot: weather_snapshot.read().clone(),
                    lat: pointer.read().as_ref().map(|p| p.lat),
                    lng: pointer.read().as_ref().map(|p| p.lng),
                }
            }

            FeaturePopup {
                hits: identify_hits,
                on_close: move |_| identify_hits.set(Vec::new()),
            }
        }
    }
}
