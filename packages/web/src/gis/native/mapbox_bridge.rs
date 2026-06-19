//! Mapbox GL bridge — Rust wrapper over `GeoSyntraMapbox` JS (Task 31.0–31.2).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::camera::{
    GLOBE_HOME_BEARING, GLOBE_HOME_LAT, GLOBE_HOME_LNG, GLOBE_HOME_PITCH, GLOBE_HOME_ZOOM,
    PROJECTION_GLOBE,
};

pub const MAP_CONTAINER_ID: &str = "gs-native-map-canvas";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapHandle {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapCreateOptions {
    pub access_token: Option<String>,
    pub style: Value,
    pub center: [f64; 2],
    pub zoom: f64,
    pub bearing: f64,
    pub pitch: f64,
    pub projection: String,
}

impl Default for MapCreateOptions {
    fn default() -> Self {
        Self {
            access_token: None,
            style: super::basemap::style_for_basemap(super::basemap::DEFAULT_BASEMAP_ID),
            center: [GLOBE_HOME_LNG, GLOBE_HOME_LAT],
            zoom: GLOBE_HOME_ZOOM,
            bearing: GLOBE_HOME_BEARING,
            pitch: GLOBE_HOME_PITCH,
            projection: PROJECTION_GLOBE.into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct MapViewState {
    pub map_id: Option<String>,
    pub lng: f64,
    pub lat: f64,
    pub zoom: f64,
    pub bearing: f64,
    pub pitch: f64,
    pub projection: Option<String>,
}

pub struct MapboxBridge;

impl MapboxBridge {
    pub fn is_available() -> bool {
        bridge_available()
    }

    pub fn create(container_id: &str, options: &MapCreateOptions) -> Option<MapHandle> {
        let payload = serde_json::json!({
            "accessToken": options.access_token,
            "style": options.style,
            "center": options.center,
            "zoom": options.zoom,
            "bearing": options.bearing,
            "pitch": options.pitch,
            "projection": options.projection,
        });
        let id = js_call_create(container_id, &payload.to_string())?;
        Some(MapHandle { id })
    }

    pub fn destroy(handle: &MapHandle) {
        js_call_void("destroy", &handle.id, None);
    }

    pub fn resize(handle: &MapHandle) {
        js_call_void("resize", &handle.id, None);
    }

    pub fn set_style(handle: &MapHandle, style: &Value) {
        if let Ok(json) = serde_json::to_string(style) {
            js_call_void("setStyle", &handle.id, Some(&json));
        }
    }

    pub fn set_projection(handle: &MapHandle, projection: &str) {
        js_call_str("setProjection", &handle.id, projection);
    }

    pub fn go_home(handle: &MapHandle) {
        js_call_void("goHome", &handle.id, None);
    }

    pub fn zoom_by(handle: &MapHandle, delta: f64) {
        js_call_f64("zoomBy", &handle.id, delta);
    }

    pub fn fly_to(handle: &MapHandle, lng: f64, lat: f64, zoom: f64) {
        js_call_fly_to(&handle.id, lng, lat, zoom);
    }

    pub fn add_geojson_layer(handle: &MapHandle, layer_id: &str, geojson: &Value, paint: &Value) {
        if let (Ok(g), Ok(p)) = (serde_json::to_string(geojson), serde_json::to_string(paint)) {
            js_call_quad(&handle.id, "addGeoJsonLayer", layer_id, &g, &p);
        }
    }

    pub fn set_layer_paint(handle: &MapHandle, layer_id: &str, paint: &Value) {
        if let Ok(p) = serde_json::to_string(paint) {
            js_call_str_pair_2(&handle.id, "setLayerPaint", layer_id, &p);
        }
    }

    pub fn set_layer_visibility(handle: &MapHandle, layer_id: &str, visible: bool) {
        js_call_bool_arg(&handle.id, "setLayerVisibility", layer_id, visible);
    }

    pub fn remove_layer(handle: &MapHandle, layer_id: &str) {
        js_call_str_pair(&handle.id, "removeLayer", layer_id);
    }

    pub fn add_raster_layer(handle: &MapHandle, layer_id: &str, tiles: &[String], opacity: f64) {
        if let Ok(t) = serde_json::to_string(tiles) {
            js_call_raster(&handle.id, layer_id, &t, opacity);
        }
    }

    pub fn set_draw_mode(handle: &MapHandle, mode: &str) {
        js_call_str_pair(&handle.id, "setDrawMode", mode);
    }

    pub fn clear_draw(handle: &MapHandle) {
        js_call_void("clearDraw", &handle.id, None);
    }

    pub fn finish_draw_polygon(handle: &MapHandle) -> Option<Value> {
        js_call_return_json(&handle.id, "finishDrawPolygon")
    }

    pub fn fit_bounds(handle: &MapHandle, west: f64, south: f64, east: f64, north: f64) {
        js_call_fit_bounds(&handle.id, west, south, east, north, 48.0);
    }

    pub fn set_search_marker(handle: &MapHandle, lng: f64, lat: f64, label: &str) {
        js_call_marker(&handle.id, lng, lat, label);
    }

    pub fn export_map_png(handle: &MapHandle) -> Option<String> {
        js_call_return_string(&handle.id, "exportMapPng")
    }

    pub fn set_layer_swipe(handle: &MapHandle, active: bool, position_pct: f64) {
        js_call_swipe(&handle.id, active, position_pct);
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn bridge_available() -> bool {
    use wasm_bindgen::JsValue;
    js_sys::Reflect::has(&js_sys::global(), &JsValue::from_str("GeoSyntraMapbox"))
        .unwrap_or(false)
        && js_call_bool("isAvailable")
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn bridge_available() -> bool {
    false
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn bridge() -> wasm_bindgen::JsValue {
    use wasm_bindgen::JsValue;
    js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("GeoSyntraMapbox"))
        .unwrap_or(JsValue::NULL)
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn method(name: &str) -> Option<js_sys::Function> {
    use wasm_bindgen::JsCast;
    let f = js_sys::Reflect::get(&bridge(), &wasm_bindgen::JsValue::from_str(name)).ok()?;
    f.dyn_into::<js_sys::Function>().ok()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_bool(name: &str) -> bool {
    let Some(f) = method(name) else {
        return false;
    };
    js_sys::Reflect::apply(&f, &bridge(), &js_sys::Array::new())
        .map(|v| v.is_truthy())
        .unwrap_or(false)
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_create(container_id: &str, options_json: &str) -> Option<String> {
    let f = method("create")?;
    let args = js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_str(container_id),
        &wasm_bindgen::JsValue::from_str(options_json),
    );
    let out = js_sys::Reflect::apply(&f, &bridge(), &args).ok()?;
    if out.is_null() || out.is_undefined() {
        return None;
    }
    out.as_string()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_void(method_name: &str, map_id: &str, extra: Option<&str>) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::new();
    args.push(&wasm_bindgen::JsValue::from_str(map_id));
    if let Some(x) = extra {
        args.push(&wasm_bindgen::JsValue::from_str(x));
    }
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_str(method_name: &str, map_id: &str, value: &str) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_str(value),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_f64(method_name: &str, map_id: &str, value: f64) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_f64(value),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_fly_to(map_id: &str, lng: f64, lat: f64, zoom: f64) {
    let Some(f) = method("flyTo") else {
        return;
    };
    let args = js_sys::Array::of4(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_f64(lng),
        &wasm_bindgen::JsValue::from_f64(lat),
        &wasm_bindgen::JsValue::from_f64(zoom),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_quad(map_id: &str, method_name: &str, a: &str, b: &str, c: &str) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::of4(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_str(a),
        &wasm_bindgen::JsValue::from_str(b),
        &wasm_bindgen::JsValue::from_str(c),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_str_pair_2(map_id: &str, method_name: &str, a: &str, b: &str) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::of3(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_str(a),
        &wasm_bindgen::JsValue::from_str(b),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_fit_bounds(map_id: &str, west: f64, south: f64, east: f64, north: f64, padding: f64) {
    let Some(f) = method("fitBounds") else {
        return;
    };
    let args = js_sys::Array::new();
    args.push(&wasm_bindgen::JsValue::from_str(map_id));
    args.push(&wasm_bindgen::JsValue::from_f64(west));
    args.push(&wasm_bindgen::JsValue::from_f64(south));
    args.push(&wasm_bindgen::JsValue::from_f64(east));
    args.push(&wasm_bindgen::JsValue::from_f64(north));
    args.push(&wasm_bindgen::JsValue::from_f64(padding));
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_str_pair(map_id: &str, method_name: &str, value: &str) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_str(value),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_bool_arg(map_id: &str, method_name: &str, layer_id: &str, visible: bool) {
    let Some(f) = method(method_name) else {
        return;
    };
    let args = js_sys::Array::of3(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_str(layer_id),
        &wasm_bindgen::JsValue::from_bool(visible),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_raster(map_id: &str, layer_id: &str, tiles_json: &str, opacity: f64) {
    let Some(f) = method("addRasterLayer") else {
        return;
    };
    let args = js_sys::Array::of4(
        &wasm_bindgen::JsValue::from_str(map_id),
        &wasm_bindgen::JsValue::from_str(layer_id),
        &wasm_bindgen::JsValue::from_str(tiles_json),
        &wasm_bindgen::JsValue::from_f64(opacity),
    );
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_return_json(map_id: &str, method_name: &str) -> Option<Value> {
    use wasm_bindgen::JsValue;
    let f = method(method_name)?;
    let args = js_sys::Array::of1(&JsValue::from_str(map_id));
    let out = js_sys::Reflect::apply(&f, &bridge(), &args).ok()?;
    if out.is_null() || out.is_undefined() {
        return None;
    }
    let s = js_sys::JSON::stringify(&out).ok()?.as_string()?;
    serde_json::from_str(&s).ok()
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_create(_container_id: &str, _options_json: &str) -> Option<String> {
    None
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_void(_method_name: &str, _map_id: &str, _extra: Option<&str>) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_str(_method_name: &str, _map_id: &str, _value: &str) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_f64(_method_name: &str, _map_id: &str, _value: f64) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_fly_to(_map_id: &str, _lng: f64, _lat: f64, _zoom: f64) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_quad(_map_id: &str, _method: &str, _a: &str, _b: &str, _c: &str) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_str_pair_2(_map_id: &str, _method: &str, _a: &str, _b: &str) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_fit_bounds(_map_id: &str, _w: f64, _s: f64, _e: f64, _n: f64, _p: f64) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_str_pair(_map_id: &str, _method: &str, _value: &str) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_bool_arg(_map_id: &str, _method: &str, _layer_id: &str, _visible: bool) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_raster(_map_id: &str, _layer_id: &str, _tiles: &str, _opacity: f64) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_return_json(_map_id: &str, _method: &str) -> Option<Value> {
    None
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_return_string(map_id: &str, method_name: &str) -> Option<String> {
    use wasm_bindgen::JsValue;
    let f = method(method_name)?;
    let args = js_sys::Array::of1(&JsValue::from_str(map_id));
    let out = js_sys::Reflect::apply(&f, &bridge(), &args).ok()?;
    if out.is_null() || out.is_undefined() {
        return None;
    }
    out.as_string()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_marker(map_id: &str, lng: f64, lat: f64, label: &str) {
    let Some(f) = method("setSearchMarker") else {
        return;
    };
    let args = js_sys::Array::new();
    args.push(&wasm_bindgen::JsValue::from_str(map_id));
    args.push(&wasm_bindgen::JsValue::from_f64(lng));
    args.push(&wasm_bindgen::JsValue::from_f64(lat));
    args.push(&wasm_bindgen::JsValue::from_str(label));
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_return_string(_map_id: &str, _method: &str) -> Option<String> {
    None
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn js_call_swipe(map_id: &str, active: bool, position_pct: f64) {
    let Some(f) = method("setLayerSwipe") else {
        return;
    };
    let args = js_sys::Array::new();
    args.push(&wasm_bindgen::JsValue::from_str(map_id));
    args.push(&wasm_bindgen::JsValue::from_bool(active));
    args.push(&wasm_bindgen::JsValue::from_f64(position_pct));
    let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_swipe(_map_id: &str, _active: bool, _position_pct: f64) {}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_call_marker(_map_id: &str, _lng: f64, _lat: f64, _label: &str) {}
