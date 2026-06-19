//! Resolve React GIS iframe URL (Task 30 — React embed bridge).

const DEFAULT_REACT_GIS_URL: &str =
    "http://127.0.0.1:5173/Geosyntra/#/satellite/indices?embed=1";
const IFRAME_ID: &str = "gs-react-gis-frame";

pub fn react_gis_iframe_id() -> &'static str {
    IFRAME_ID
}

/// Dev default: Vite HashRouter satellite workspace. Override via `window.GEOSYNTRA_REACT_GIS_URL`.
pub fn react_gis_embed_url() -> String {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        use wasm_bindgen::JsValue;
        if let Ok(val) = js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("GEOSYNTRA_REACT_GIS_URL"))
        {
            if let Some(s) = val.as_string().filter(|s| !s.trim().is_empty()) {
                return s;
            }
        }
    }
    DEFAULT_REACT_GIS_URL.into()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn react_embed_bridge() -> wasm_bindgen::JsValue {
    js_sys::Reflect::get(
        &js_sys::global(),
        &wasm_bindgen::JsValue::from_str("GeoSyntraReactEmbed"),
    )
    .unwrap_or(wasm_bindgen::JsValue::NULL)
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn call_bridge(method: &str, args: &js_sys::Array) {
    use wasm_bindgen::JsCast;
    let bridge = react_embed_bridge();
    let Ok(val) = js_sys::Reflect::get(&bridge, &wasm_bindgen::JsValue::from_str(method)) else {
        return;
    };
    let Some(func) = val.dyn_ref::<js_sys::Function>() else {
        return;
    };
    let _ = js_sys::Reflect::apply(func, &bridge, args);
}

/// Push Dioxus session into React iframe (retries while React hydrates).
pub fn on_react_iframe_load(session_json: &str) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let args = js_sys::Array::of2(
            &wasm_bindgen::JsValue::from_str(IFRAME_ID),
            &wasm_bindgen::JsValue::from_str(session_json),
        );
        call_bridge("onIframeLoad", &args);
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        let _ = session_json;
    }
}
