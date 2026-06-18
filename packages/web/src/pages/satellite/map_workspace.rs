use dioxus::prelude::*;

use crate::{
    api::settings::config::fetch_mapbox_config,
    auth_session::AuthContext,
    components::{AppNavBar, AppNavSection},
    error_display::display_api_error,
    gis::{
        aoi_bounds, load_aoi_geojson_collection, load_aois_for_session, persist_aoi, remove_aoi,
        upsert_aoi_from_geojson, AddedLayer, AoiRecord, DrawMode, LayerKind, LayerStore, MapboxBridge,
        MapHandle, MapInitOptions,
    },
    routes::Route,
    wall_clock::now_ms,
};

const MAP_CONTAINER_ID: &str = "gs-map-canvas";

/// `/satellite` → `/satellite/indices` (Task 28.1).
#[component]
pub fn Satellite() -> Element {
    let nav = use_navigator();
    use_effect(move || {
        let _ = nav.replace(Route::SatelliteIndices {});
    });
    rsx! {
        div { class: "gs-gis-loading", "Opening GeoAI workspace…" }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct IdentifyHit {
    lng: f64,
    lat: f64,
    summary: String,
}

#[component]
pub fn SatelliteIndices() -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();
    let session = auth.session.read().clone();
    let signed_in = session.is_signed_in();
    let tenant = session.active_tenant().to_string();
    let email = session.email.clone().unwrap_or_default();
    let api_token = session.access_token.clone();
    let can_write = session.has_permission("aoi.write");

    let mut map_ready = use_signal(|| false);
    let mut map_error = use_signal(|| None::<String>);
    let mut map_handle = use_signal(|| None::<MapHandle>);
    let mut token = use_signal(|| None::<String>);
    let mut aois = use_signal(Vec::<AoiRecord>::new);
    let mut layers = use_signal(|| LayerStore::load(&tenant));
    let mut draw_mode = use_signal(|| DrawMode::Select);
    let mut panel = use_signal(|| "aoi".to_string());
    let mut identify = use_signal(|| None::<IdentifyHit>);
    let mut geo_ai_open = use_signal(|| false);
    let mut analysis_note = use_signal(|| "Select an AOI or draw a polygon to begin analysis.".to_string());

    let session_gate = session.clone();
    use_effect(move || {
        if !session_gate.is_signed_in() {
            let _ = nav.replace(Route::Login {});
        } else if !session_gate.has_permission("app.access") || !session_gate.has_permission("aoi.read") {
            let _ = nav.replace(Route::Landing {});
        }
    });

    // Load Mapbox token + AOI list
    use_effect({
        let tenant = tenant.clone();
        let email = email.clone();
        let api_token = api_token.clone();
        move || {
            if !signed_in {
                return;
            }
            let tenant_aoi = tenant.clone();
            let email_aoi = email.clone();
            let api_token_aoi = api_token.clone();
            spawn(async move {
                aois.set(
                    load_aois_for_session(&tenant_aoi, &email_aoi, api_token_aoi.as_deref()).await,
                );
            });
            spawn(async move {
                match fetch_mapbox_config().await {
                    Ok(cfg) => {
                        if cfg.configured.unwrap_or(false) {
                            if let Some(t) = cfg.public_token.filter(|s| !s.is_empty()) {
                                token.set(Some(t));
                            } else {
                                map_error.set(Some(
                                    "Mapbox configured but no public token returned. Check API integrations.".into(),
                                ));
                            }
                        } else {
                            map_error.set(Some(
                                "Mapbox is not configured. Set MAPBOX_TOKEN on the Axum server.".into(),
                            ));
                        }
                    }
                    Err(err) => map_error.set(Some(display_api_error(&err))),
                }
            });
        }
    });

    // Mount map when token available (wasm only)
    use_effect({
        let tenant = tenant.clone();
        let email = email.clone();
        move || {
            let Some(tok) = token.read().clone() else { return };
            #[cfg(all(feature = "web", target_arch = "wasm32"))]
            {
                if !MapboxBridge::is_available() {
                    map_error.set(Some("Mapbox bridge not loaded. Check index.html scripts.".into()));
                    return;
                }
                if map_handle.read().is_some() {
                    return;
                }
                let opts = MapInitOptions::default();
                if let Some(handle) = MapboxBridge::create(MAP_CONTAINER_ID, &tok, &opts) {
                    MapboxBridge::init_draw(&handle);
                    let collection = load_aoi_geojson_collection(&tenant, &email);
                    MapboxBridge::sync_aoi_layer(&handle, &collection.to_string());
                    for layer in layers.read().iter() {
                        if layer.kind == LayerKind::Indices {
                            if let Some(url) = &layer.tile_url {
                                MapboxBridge::add_wms_layer(&handle, &layer.id, url);
                                MapboxBridge::set_layer_visibility(&handle, &layer.id, layer.visible);
                            }
                        }
                    }
                    map_handle.set(Some(handle));
                    map_ready.set(true);
                } else {
                    map_error.set(Some("Failed to create Mapbox map.".into()));
                }
            }
            #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
            {
                let _ = tok;
                map_error.set(Some("Map renders in wasm client only (dx serve --platform web).".into()));
            }
        }
    });

    // Map event listeners
    use_effect({
        let tenant = tenant.clone();
        let email = email.clone();
        let api_token_draw = api_token.clone();
        move || {
            #[cfg(all(feature = "web", target_arch = "wasm32"))]
            {
                use wasm_bindgen::JsCast;
                use wasm_bindgen::JsValue;

                let Some(window) = web_sys::window() else { return };
                let tenant_draw = tenant.clone();
                let email_draw = email.clone();
                let api_token_draw = api_token_draw.clone();
                let draw_closure = wasm_bindgen::closure::Closure::wrap(Box::new(move |event: web_sys::Event| {
                    let Some(detail) = event.dyn_ref::<web_sys::CustomEvent>() else { return };
                    let obj = js_sys::Reflect::get(detail, &JsValue::from_str("detail")).ok();
                    let geo_val = obj
                        .as_ref()
                        .and_then(|o| js_sys::Reflect::get(o, &JsValue::from_str("geojson")).ok());
                    let geo_str = geo_val
                        .as_ref()
                        .and_then(|v| js_sys::JSON::stringify(v).ok())
                        .and_then(|s| s.as_string())
                        .unwrap_or_else(|| r#"{"type":"FeatureCollection","features":[]}"#.into());
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&geo_str) {
                        if let Some(features) = val.get("features").and_then(|f| f.as_array()) {
                            for (i, feat) in features.iter().enumerate() {
                                let name = format!("Drawn AOI {}", i + 1);
                                let record = upsert_aoi_from_geojson(&tenant_draw, &email_draw, &name, feat);
                                let tenant_spawn = tenant_draw.clone();
                                let email_spawn = email_draw.clone();
                                let token_spawn = api_token_draw.clone();
                                spawn(async move {
                                    persist_aoi(&record, token_spawn.as_deref()).await;
                                    aois.set(
                                        load_aois_for_session(&tenant_spawn, &email_spawn, token_spawn.as_deref())
                                            .await,
                                    );
                                    analysis_note.set(format!("{} AOI(s) on map.", aois.read().len()));
                                });
                            }
                            if features.is_empty() {
                                analysis_note.set(format!("{} AOI(s) on map.", aois.read().len()));
                            }
                        }
                    }
                }) as Box<dyn FnMut(_)>);
                let _ = window.add_event_listener_with_callback(
                    "geosyntra-draw-change",
                    draw_closure.as_ref().unchecked_ref(),
                );
                draw_closure.forget();

                let click_closure = wasm_bindgen::closure::Closure::wrap(Box::new(move |event: web_sys::Event| {
                    let Some(detail) = event.dyn_ref::<web_sys::CustomEvent>() else { return };
                    let obj = js_sys::Reflect::get(detail, &JsValue::from_str("detail")).ok();
                    let lng = obj
                        .as_ref()
                        .and_then(|o| js_sys::Reflect::get(o, &JsValue::from_str("lng")).ok())
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    let lat = obj
                        .as_ref()
                        .and_then(|o| js_sys::Reflect::get(o, &JsValue::from_str("lat")).ok())
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    identify.set(Some(IdentifyHit {
                        lng,
                        lat,
                        summary: format!("{lat:.5}°N, {lng:.5}°E"),
                    }));
                }) as Box<dyn FnMut(_)>);
                let _ = window.add_event_listener_with_callback(
                    "geosyntra-map-click",
                    click_closure.as_ref().unchecked_ref(),
                );
                click_closure.forget();
            }
        }
    });

    if !signed_in
        || !session.has_permission("app.access")
        || !session.has_permission("aoi.read")
    {
        return rsx! {
            div { class: "gs-gis-gate", p { "Sign in to open the GeoAI workspace." } }
        };
    }

    rsx! {
        div { class: "gs-gis-page si-page si-page--map-canvas", "data-si-fit-mode": "default",
            AppNavBar {
                active: AppNavSection::GeoAi,
                subtitle: Some("Satellite intelligence".into()),
            }

            div { class: "gs-gis-body",
                aside { class: "gs-gis-rail", role: "toolbar", aria_label: "Map tools",
                    button {
                        class: if *draw_mode.read() == DrawMode::Select { "gs-gis-rail__btn gs-gis-rail__btn--active" } else { "gs-gis-rail__btn" },
                        title: "Select",
                        disabled: !can_write,
                        onclick: move |_| {
                            draw_mode.set(DrawMode::Select);
                            if let Some(h) = map_handle.read().clone() {
                                MapboxBridge::set_draw_mode(&h, DrawMode::Select);
                            }
                        },
                        "▶"
                    }
                    button {
                        class: if *draw_mode.read() == DrawMode::DrawPolygon { "gs-gis-rail__btn gs-gis-rail__btn--active" } else { "gs-gis-rail__btn" },
                        title: "Draw polygon",
                        disabled: !can_write,
                        onclick: move |_| {
                            draw_mode.set(DrawMode::DrawPolygon);
                            if let Some(h) = map_handle.read().clone() {
                                MapboxBridge::set_draw_mode(&h, DrawMode::DrawPolygon);
                            }
                        },
                        "⬠"
                    }
                    button {
                        class: if *draw_mode.read() == DrawMode::DrawRectangle { "gs-gis-rail__btn gs-gis-rail__btn--active" } else { "gs-gis-rail__btn" },
                        title: "Draw rectangle",
                        disabled: !can_write,
                        onclick: move |_| {
                            draw_mode.set(DrawMode::DrawRectangle);
                            if let Some(h) = map_handle.read().clone() {
                                MapboxBridge::set_draw_mode(&h, DrawMode::DrawRectangle);
                            }
                        },
                        "▭"
                    }
                    button {
                        class: if panel() == "aoi" { "gs-gis-rail__btn gs-gis-rail__btn--active" } else { "gs-gis-rail__btn" },
                        title: "AOI",
                        onclick: move |_| panel.set("aoi".into()),
                        "◎"
                    }
                    button {
                        class: if panel() == "layers" { "gs-gis-rail__btn gs-gis-rail__btn--active" } else { "gs-gis-rail__btn" },
                        title: "Layers",
                        onclick: move |_| panel.set("layers".into()),
                        "☰"
                    }
                    button {
                        class: if panel() == "indices" { "gs-gis-rail__btn gs-gis-rail__btn--active" } else { "gs-gis-rail__btn" },
                        title: "Indices",
                        onclick: move |_| panel.set("indices".into()),
                        "◉"
                    }
                }

                div { class: "gs-gis-main",
                    if let Some(err) = map_error.read().clone() {
                        div { class: "gs-gis-banner gs-gis-banner--error", "{err}"
                            Link { to: Route::SettingsApiIntegrations {}, " API integrations" }
                        }
                    }

                    div { class: "gs-gis-map-wrap si-map-container",
                        div {
                            id: MAP_CONTAINER_ID,
                            class: "gs-gis-map-canvas mapboxgl-map",
                            "data-testid": "gis-map-canvas",
                        }
                        if !*map_ready.read() && map_error.read().is_none() {
                            div { class: "gs-gis-map-loading", "Loading map…" }
                        }
                    }

                    if panel() == "aoi" || panel() == "layers" || panel() == "indices" {
                        aside { class: "gs-gis-panel",
                            if panel() == "aoi" {
                                h2 { class: "gs-gis-panel__title", "Areas of interest" }
                                if !can_write {
                                    p { class: "gs-hint", "Read-only — `aoi.write` required to draw." }
                                }
                                ul { class: "gs-gis-aoi-list",
                                    for aoi in aois.read().iter() {
                                        li { class: "gs-gis-aoi-item", key: "{aoi.id}",
                                            span { class: "gs-gis-aoi-item__name", "{aoi.name}" }
                                            div { class: "gs-gis-aoi-item__actions",
                                                button {
                                                    class: "gs-btn gs-btn--ghost",
                                                    onclick: {
                                                        let id = aoi.id.clone();
                                                        let geo = aoi.geojson.clone();
                                                        move |_| {
                                                            if let Some(h) = map_handle.read().clone() {
                                                                if let Some([w, s, e, n]) = aoi_bounds(&geo) {
                                                                    MapboxBridge::fit_bounds(&h, w, s, e, n);
                                                                } else {
                                                                    MapboxBridge::fly_to(&h, 0.0, 20.0, 2.0);
                                                                }
                                                            }
                                                        }
                                                    },
                                                    "Fit"
                                                }
                                                if can_write {
                                                    button {
                                                        class: "gs-btn gs-btn--ghost",
                                                        onclick: {
                                                            let id = aoi.id.clone();
                                                            let tenant = tenant.clone();
                                                            let email = email.clone();
                                                            let api_token = api_token.clone();
                                                            move |_| {
                                                                let tenant = tenant.clone();
                                                                let email = email.clone();
                                                                let id = id.clone();
                                                                let api_token = api_token.clone();
                                                                spawn(async move {
                                                                    remove_aoi(
                                                                        &tenant,
                                                                        &email,
                                                                        &id,
                                                                        api_token.as_deref(),
                                                                    )
                                                                    .await;
                                                                    let loaded = load_aois_for_session(
                                                                        &tenant,
                                                                        &email,
                                                                        api_token.as_deref(),
                                                                    )
                                                                    .await;
                                                                    aois.set(loaded);
                                                                    if let Some(h) = map_handle.read().clone() {
                                                                        let col = load_aoi_geojson_collection(&tenant, &email);
                                                                        MapboxBridge::sync_aoi_layer(&h, &col.to_string());
                                                                    }
                                                                });
                                                            }
                                                        },
                                                        "Remove"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                if can_write {
                                    button {
                                        class: "gs-btn gs-btn--primary",
                                        onclick: {
                                            let tenant = tenant.clone();
                                            let email = email.clone();
                                            let api_token = api_token.clone();
                                            move |_| {
                                                let id = format!("aoi-{}", now_ms());
                                                let geo = serde_json::json!({
                                                    "type": "Feature",
                                                    "id": id,
                                                    "properties": { "name": "Sample field" },
                                                    "geometry": {
                                                        "type": "Polygon",
                                                        "coordinates": [[[35.0, 31.5], [35.05, 31.5], [35.05, 31.55], [35.0, 31.55], [35.0, 31.5]]]
                                                    }
                                                });
                                                let record = AoiRecord {
                                                    id: id.clone(),
                                                    name: "Sample field".into(),
                                                    tenant_id: tenant.clone(),
                                                    email: email.clone(),
                                                    geojson: geo.clone(),
                                                    updated_at_ms: now_ms(),
                                                };
                                                let tenant = tenant.clone();
                                                let email = email.clone();
                                                let api_token = api_token.clone();
                                                spawn(async move {
                                                    persist_aoi(&record, api_token.as_deref()).await;
                                                    aois.set(
                                                        load_aois_for_session(
                                                            &tenant,
                                                            &email,
                                                            api_token.as_deref(),
                                                        )
                                                        .await,
                                                    );
                                                    if let Some(h) = map_handle.read().clone() {
                                                        let col = load_aoi_geojson_collection(&tenant, &email);
                                                        MapboxBridge::sync_aoi_layer(&h, &col.to_string());
                                                        if let Some([w, s, e, n]) = aoi_bounds(&geo) {
                                                            MapboxBridge::fit_bounds(&h, w, s, e, n);
                                                        }
                                                    }
                                                });
                                            }
                                        },
                                        "Add sample AOI"
                                    }
                                }
                            } else if panel() == "layers" {
                                h2 { class: "gs-gis-panel__title", "Layers" }
                                for layer in layers.read().iter() {
                                    div { class: "gs-gis-layer-row", key: "{layer.id}",
                                        label {
                                            input {
                                                r#type: "checkbox",
                                                checked: layer.visible,
                                                onchange: {
                                                    let layer_id = layer.id.clone();
                                                    let tenant_save = tenant.clone();
                                                    move |e| {
                                                        let visible = e.checked();
                                                        layers.with_mut(|list| {
                                                            if let Some(l) = list.iter_mut().find(|x| x.id == layer_id) {
                                                                l.visible = visible;
                                                            }
                                                        });
                                                        if let Some(h) = map_handle.read().clone() {
                                                            MapboxBridge::set_layer_visibility(&h, &layer_id, visible);
                                                        }
                                                        LayerStore::save(&tenant_save, &layers.read());
                                                    }
                                                },
                                            }
                                            " {layer.name}"
                                        }
                                    }
                                }
                            } else {
                                h2 { class: "gs-gis-panel__title", "Spectral indices" }
                                p { class: "gs-hint",
                                    "Toggle NDVI demo layer from the Layers panel. Full Sentinel Hub integration follows in later 28.x iterations."
                                }
                                button {
                                    class: "gs-btn gs-btn--ghost",
                                    onclick: move |_| panel.set("layers".into()),
                                    "Open layers"
                                }
                            }
                        }
                    }

                    if let Some(hit) = identify.read().clone() {
                        div { class: "gs-gis-identify", role: "status",
                            p { class: "gs-gis-identify__title", "Map identify" }
                            p { "{hit.summary}" }
                            button {
                                class: "gs-gis-identify__close",
                                onclick: move |_| identify.set(None),
                                "×"
                            }
                        }
                    }

                    footer { class: "gs-gis-analysis",
                        p { class: "gs-gis-analysis__note", "{analysis_note()}" }
                        span { class: "gs-gis-analysis__badge", "Static AOI comparison · coming soon" }
                    }
                }

                button {
                    class: if geo_ai_open() { "gs-gis-geo-ai gs-gis-geo-ai--open" } else { "gs-gis-geo-ai" },
                    title: "GeoAI assistant",
                    onclick: move |_| geo_ai_open.set(!geo_ai_open()),
                    "✦ GeoAI"
                }
                if geo_ai_open() {
                    div { class: "gs-gis-geo-ai-panel",
                        h3 { "GeoAI assistant" }
                        p { class: "gs-hint",
                            "Shell for map-aware chat (Task 28.12). Connect to Axum AI routes in a follow-up iteration."
                        }
                        button {
                            class: "gs-btn gs-btn--ghost",
                            onclick: move |_| geo_ai_open.set(false),
                            "Close"
                        }
                    }
                }
            }
        }
    }
}
