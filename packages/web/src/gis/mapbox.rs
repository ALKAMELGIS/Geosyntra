//! Mapbox GL bridge — Rust wrapper over `GeoSyntraMapbox` JS (Task 28.2).

#[derive(Debug, Clone)]
pub struct MapInitOptions {
    pub style: String,
    pub center_lng: f64,
    pub center_lat: f64,
    pub zoom: f64,
    pub proxy_mode: bool,
}

impl Default for MapInitOptions {
    fn default() -> Self {
        Self {
            style: "mapbox://styles/mapbox/satellite-streets-v12".into(),
            center_lng: 0.0,
            center_lat: 20.0,
            zoom: 1.5,
            proxy_mode: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapHandle {
    pub id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DrawMode {
    Select,
    DrawPolygon,
    DrawRectangle,
}

impl DrawMode {
    pub fn as_js_mode(self) -> &'static str {
        match self {
            DrawMode::Select => "simple_select",
            DrawMode::DrawPolygon => "draw_polygon",
            DrawMode::DrawRectangle => "draw_rectangle",
        }
    }
}

pub struct MapboxBridge;

impl MapboxBridge {
    pub fn is_available() -> bool {
        bridge_available()
    }

    pub fn create(container_id: &str, token: &str, options: &MapInitOptions) -> Option<MapHandle> {
        let opts = serde_json::json!({
            "style": options.style,
            "center": [options.center_lng, options.center_lat],
            "zoom": options.zoom,
            "proxyMode": options.proxy_mode,
        });
        let id = js_create(container_id, token, &opts.to_string())?;
        Some(MapHandle { id })
    }

    pub fn destroy(handle: &MapHandle) {
        js_destroy(&handle.id);
    }

    pub fn resize(handle: &MapHandle) {
        js_resize(&handle.id);
    }

    pub fn fit_bounds(handle: &MapHandle, west: f64, south: f64, east: f64, north: f64) {
        js_fit_bounds(&handle.id, west, south, east, north, 48.0);
    }

    pub fn fly_to(handle: &MapHandle, lng: f64, lat: f64, zoom: f64) {
        js_fly_to(&handle.id, lng, lat, zoom);
    }

    pub fn init_draw(handle: &MapHandle) {
        js_init_draw(&handle.id);
    }

    pub fn set_draw_mode(handle: &MapHandle, mode: DrawMode) {
        js_set_draw_mode(&handle.id, mode.as_js_mode());
    }

    pub fn get_draw_geojson(handle: &MapHandle) -> String {
        js_get_draw_geojson(&handle.id)
    }

    pub fn set_draw_geojson(handle: &MapHandle, geojson: &str) {
        js_set_draw_geojson(&handle.id, geojson);
    }

    pub fn sync_aoi_layer(handle: &MapHandle, geojson: &str) {
        js_add_geojson_source(
            &handle.id,
            "gs-aoi-store",
            geojson,
            "{\"fillColor\":\"#22c55e\",\"fillOpacity\":0.2,\"lineColor\":\"#4ade80\",\"lineWidth\":2}",
        );
    }

    pub fn add_wms_layer(handle: &MapHandle, layer_id: &str, tile_url: &str) {
        js_add_wms_layer(&handle.id, layer_id, tile_url);
    }

    pub fn set_layer_visibility(handle: &MapHandle, layer_id: &str, visible: bool) {
        js_set_layer_visibility(&handle.id, layer_id, visible);
    }

    pub fn remove_source(handle: &MapHandle, source_id: &str) {
        js_remove_source(&handle.id, source_id);
    }
}

fn bridge_available() -> bool {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        use wasm_bindgen::JsValue;
        return js_sys::Reflect::has(&js_sys::global(), &JsValue::from_str("GeoSyntraMapbox"))
            .unwrap_or(false);
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        false
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
mod js {
    use wasm_bindgen::{JsCast, JsValue};

    fn bridge() -> JsValue {
        js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("GeoSyntraMapbox"))
            .unwrap_or(JsValue::NULL)
    }

    fn method(name: &str) -> Option<js_sys::Function> {
        let f = js_sys::Reflect::get(&bridge(), &JsValue::from_str(name)).ok()?;
        f.dyn_into::<js_sys::Function>().ok()
    }

    fn call0(name: &str) -> JsValue {
        let Some(f) = method(name) else {
            return JsValue::NULL;
        };
        js_sys::Reflect::apply(&f, &bridge(), &js_sys::Array::new()).unwrap_or(JsValue::NULL)
    }

    fn call1(name: &str, a: JsValue) -> JsValue {
        let Some(f) = method(name) else {
            return JsValue::NULL;
        };
        js_sys::Reflect::apply(&f, &bridge(), &js_sys::Array::of1(&a)).unwrap_or(JsValue::NULL)
    }

    fn call2(name: &str, a: JsValue, b: JsValue) -> JsValue {
        let Some(f) = method(name) else {
            return JsValue::NULL;
        };
        js_sys::Reflect::apply(&f, &bridge(), &js_sys::Array::of2(&a, &b)).unwrap_or(JsValue::NULL)
    }

    pub fn js_create(container_id: &str, token: &str, options_json: &str) -> Option<String> {
        let f = method("create")?;
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(container_id));
        args.push(&JsValue::from_str(token));
        args.push(&JsValue::from_str(options_json));
        let out = js_sys::Reflect::apply(&f, &bridge(), &args).ok()?;
        out.as_string()
    }

    pub fn js_destroy(map_id: &str) {
        call1("destroy", JsValue::from_str(map_id));
    }

    pub fn js_resize(map_id: &str) {
        call1("resize", JsValue::from_str(map_id));
    }

    pub fn js_fit_bounds(map_id: &str, w: f64, s: f64, e: f64, n: f64, pad: f64) {
        let Some(f) = method("fitBounds") else { return };
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(map_id));
        args.push(&JsValue::from_f64(w));
        args.push(&JsValue::from_f64(s));
        args.push(&JsValue::from_f64(e));
        args.push(&JsValue::from_f64(n));
        args.push(&JsValue::from_f64(pad));
        let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
    }

    pub fn js_fly_to(map_id: &str, lng: f64, lat: f64, zoom: f64) {
        let Some(f) = method("flyTo") else { return };
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(map_id));
        args.push(&JsValue::from_f64(lng));
        args.push(&JsValue::from_f64(lat));
        args.push(&JsValue::from_f64(zoom));
        let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
    }

    pub fn js_init_draw(map_id: &str) {
        call1("initDraw", JsValue::from_str(map_id));
    }

    pub fn js_set_draw_mode(map_id: &str, mode: &str) {
        call2(
            "setDrawMode",
            JsValue::from_str(map_id),
            JsValue::from_str(mode),
        );
    }

    pub fn js_get_draw_geojson(map_id: &str) -> String {
        call1("getDrawGeoJson", JsValue::from_str(map_id))
            .as_string()
            .unwrap_or_else(|| r#"{"type":"FeatureCollection","features":[]}"#.into())
    }

    pub fn js_set_draw_geojson(map_id: &str, geojson: &str) {
        call2(
            "setDrawGeoJson",
            JsValue::from_str(map_id),
            JsValue::from_str(geojson),
        );
    }

    pub fn js_add_geojson_source(map_id: &str, source_id: &str, geojson: &str, paint: &str) {
        let Some(f) = method("addGeoJsonSource") else { return };
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(map_id));
        args.push(&JsValue::from_str(source_id));
        args.push(&JsValue::from_str(geojson));
        args.push(&JsValue::from_str(paint));
        let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
    }

    pub fn js_add_wms_layer(map_id: &str, layer_id: &str, tile_url: &str) {
        let Some(f) = method("addWmsLayer") else { return };
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(map_id));
        args.push(&JsValue::from_str(layer_id));
        args.push(&JsValue::from_str(tile_url));
        let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
    }

    pub fn js_set_layer_visibility(map_id: &str, layer_id: &str, visible: bool) {
        let Some(f) = method("setLayerVisibility") else { return };
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(map_id));
        args.push(&JsValue::from_str(layer_id));
        args.push(&JsValue::from_bool(visible));
        let _ = js_sys::Reflect::apply(&f, &bridge(), &args);
    }

    pub fn js_remove_source(map_id: &str, source_id: &str) {
        call2(
            "removeSource",
            JsValue::from_str(map_id),
            JsValue::from_str(source_id),
        );
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
use js::*;

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_create(_: &str, _: &str, _: &str) -> Option<String> {
    None
}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_destroy(_: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_resize(_: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_fit_bounds(_: &str, _: f64, _: f64, _: f64, _: f64, _: f64) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_fly_to(_: &str, _: f64, _: f64, _: f64) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_init_draw(_: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_set_draw_mode(_: &str, _: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_get_draw_geojson(_: &str) -> String {
    r#"{"type":"FeatureCollection","features":[]}"#.into()
}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_set_draw_geojson(_: &str, _: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_add_geojson_source(_: &str, _: &str, _: &str, _: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_add_wms_layer(_: &str, _: &str, _: &str) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_set_layer_visibility(_: &str, _: &str, _: bool) {}
#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
fn js_remove_source(_: &str, _: &str) {}
