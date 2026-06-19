//! Native Mapbox GIS workspace (Task 31) — 3D globe, toolbox panels, layer sync.

use dioxus::prelude::*;
use serde_json::{json, Value};

use super::{
    basemap_picker::normalize_basemap_id,
    map_shell::MapShell,
    map_status_bar::MapPointer,
    tool_panel::{
        demo_field_geojson, load_layers, paint_for_color, persist_layers, wms_tile_url, ToolPanel,
        DEMO_LAYER_ID, WMS_LAYER_ID,
    },
};
use crate::{
    api::settings::config::fetch_mapbox_config,
    auth_session::AuthContext,
    components::{AppNavBar, AppNavSection},
    gis::{
        aoi_bounds, list_aois, upsert_aoi_from_geojson, AddedLayer, AoiRecord, LayerKind,
        native::{
            resolve_gl_access_token, MapboxBridge, MapCreateOptions, MapHandle, PROJECTION_GLOBE,
            PROJECTION_MERCATOR, DEFAULT_BASEMAP_ID, MAP_CONTAINER_ID, style_for_basemap,
        },
    },
    routes::Route,
};

fn aoi_layer_id(aoi_id: &str) -> String {
    format!("aoi-{aoi_id}")
}

fn sync_map_layers(handle: &MapHandle, layers: &[AddedLayer], aois: &[AoiRecord], sym_color: &str) {
    let paint = paint_for_color(sym_color);

    if let Some(demo) = layers.iter().find(|l| l.id == DEMO_LAYER_ID) {
        MapboxBridge::add_geojson_layer(handle, DEMO_LAYER_ID, &demo_field_geojson(), &paint);
        MapboxBridge::set_layer_visibility(handle, DEMO_LAYER_ID, demo.visible);
    }

    if let Some(wms) = layers.iter().find(|l| l.id == WMS_LAYER_ID) {
        if wms.visible {
            if let Some(url) = wms_tile_url() {
                MapboxBridge::add_raster_layer(handle, WMS_LAYER_ID, &[url], 0.85);
            }
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
}

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
    let mut active_tool = use_signal(|| "remote-sensing".to_string());
    let mut globe_mode = use_signal(|| true);
    let mut map_handle = use_signal(|| None::<MapHandle>);
    let mut map_ready = use_signal(|| false);
    let mut map_error = use_signal(|| None::<String>);
    let mut pointer = use_signal(|| None::<MapPointer>);
    let mut projection_label = use_signal(|| "3D Scene".to_string());
    let mut gl_access_token = use_signal(|| resolve_gl_access_token(None));

    let mut layers = use_signal(|| load_layers(&tenant_id));
    let mut aois = use_signal(|| list_aois(&tenant_id, &email));
    let mut selected_aoi_id = use_signal(|| None::<String>);
    let mut identify_hits = use_signal(Vec::<String>::new);
    let mut symbology_color = use_signal(|| "blue".to_string());
    let mut upload_json = use_signal(String::new);
    let mut draw_points = use_signal(|| 0_usize);

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
        move || {
            if let Some(handle) = map_handle.read().clone() {
                MapboxBridge::set_style(&handle, &style_for_basemap(&basemap));
            }
        }
    });

    use_effect({
        let layer_list = layers();
        let aoi_list = aois();
        let color = symbology_color();
        move || {
            if !*map_ready.read() {
                return;
            }
            if let Some(handle) = map_handle.read().clone() {
                sync_map_layers(&handle, &layer_list, &aoi_list, &color);
            }
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
            sync_map_layers(&handle, &layers(), &aois(), &symbology_color());
        }
    };

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
                if let Some(url) = wms_tile_url() {
                    MapboxBridge::add_raster_layer(&handle, WMS_LAYER_ID, &[url], 0.85);
                }
            } else {
                MapboxBridge::set_layer_visibility(&handle, WMS_LAYER_ID, false);
            }
        }
    };

    let on_start_draw = move |_| {
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
            sync_map_layers(&handle, &layers(), &aois(), &symbology_color());
            if let Some([w, s, e, n]) = aoi_bounds(&feature) {
                MapboxBridge::fit_bounds(&handle, w, s, e, n);
            }
        }
    };

    let on_apply_symbology = move |color: String| {
        symbology_color.set(color.clone());
        if let Some(handle) = map_handle.read().clone() {
            MapboxBridge::set_layer_paint(&handle, DEMO_LAYER_ID, &paint_for_color(&color));
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
                basemap_id: basemap_id(),
                basemap_open: *basemap_open.read(),
                active_tool: active_tool(),
                globe_mode: *globe_mode.read(),
                map_ready: *map_ready.read(),
                map_error: map_error.read().clone(),
                pointer: pointer.read().clone(),
                projection_label: projection_label(),
                on_basemap_toggle: move |_| basemap_open.set(!basemap_open()),
                on_basemap_select: move |id: String| {
                    basemap_id.set(normalize_basemap_id(&id));
                    basemap_open.set(false);
                },
                on_tool_select: move |id: String| active_tool.set(id),
                on_toggle_projection: toggle_projection,
                on_zoom_in: zoom_in,
                on_zoom_out: zoom_out,
                on_go_home: go_home,
                tool_panel: rsx! {
                    ToolPanel {
                        active_tool: active_tool(),
                        layers: layers,
                        aois: aois,
                        selected_aoi_id: selected_aoi_id,
                        identify_hits: identify_hits,
                        symbology_color: symbology_color,
                        upload_json: upload_json,
                        draw_points: draw_points,
                        on_layers_changed: on_layers_changed,
                        on_aois_changed: on_aois_changed,
                        on_add_demo_layer: on_add_demo_layer,
                        on_sync_wms: on_sync_wms,
                        on_start_draw: on_start_draw,
                        on_finish_draw: on_finish_draw,
                        on_clear_draw: on_clear_draw,
                        on_apply_symbology: on_apply_symbology,
                        on_upload: on_upload,
                    }
                },
            }
        }
    }
}
