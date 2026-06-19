//! Remote sensing settings — aligned with React `SATELLITE_PROVIDERS` / field analysis panel.

use serde::{Deserialize, Serialize};

const RS_SETTINGS_KEY: &str = "geosyntra_gis_remote_sensing_v1";

pub const DEFAULT_PROVIDER_ID: &str = "sentinel-hub";
pub const DEFAULT_COLLECTION_ID: &str = "sentinel-2-l2a";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SatelliteProvider {
    pub id: &'static str,
    pub label: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SatelliteCollection {
    pub id: &'static str,
    pub label: &'static str,
}

pub fn providers() -> &'static [SatelliteProvider] {
    const LIST: &[SatelliteProvider] = &[SatelliteProvider {
        id: "sentinel-hub",
        label: "Sentinel Hub",
    }];
    LIST
}

pub fn collections_for(provider_id: &str) -> &'static [SatelliteCollection] {
    match provider_id {
        "sentinel-hub" => &[
            SatelliteCollection {
                id: "sentinel-2-l2a",
                label: "Sentinel-2 L2A",
            },
            SatelliteCollection {
                id: "sentinel-1-grd",
                label: "Sentinel-1 GRD",
            },
        ],
        _ => &[],
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RemoteSensingSettings {
    pub provider_id: String,
    pub collection_id: String,
    pub imagery_date: String,
    pub time_series_start: String,
    pub time_series_end: String,
}

impl Default for RemoteSensingSettings {
    fn default() -> Self {
        Self {
            provider_id: DEFAULT_PROVIDER_ID.into(),
            collection_id: DEFAULT_COLLECTION_ID.into(),
            imagery_date: iso_today(),
            time_series_start: iso_days_ago(84),
            time_series_end: iso_today(),
        }
    }
}

pub struct RemoteSensingStore;

impl RemoteSensingStore {
    pub fn load(tenant_id: &str) -> RemoteSensingSettings {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let key = format!("{RS_SETTINGS_KEY}:{tenant_id}");
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    if let Ok(Some(raw)) = storage.get_item(&key) {
                        if let Ok(settings) = serde_json::from_str(&raw) {
                            return settings;
                        }
                    }
                }
            }
        }
        RemoteSensingSettings::default()
    }

    pub fn save(tenant_id: &str, settings: &RemoteSensingSettings) {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let key = format!("{RS_SETTINGS_KEY}:{tenant_id}");
            if let Ok(json) = serde_json::to_string(settings) {
                if let Some(window) = web_sys::window() {
                    if let Ok(Some(storage)) = window.local_storage() {
                        let _ = storage.set_item(&key, &json);
                    }
                }
            }
        }
        let _ = (tenant_id, settings);
    }
}

pub fn iso_today() -> String {
    format_iso_from_ms(crate::wall_clock::now_ms())
}

pub fn iso_days_ago(days: i64) -> String {
    let ms = crate::wall_clock::now_ms() - days * 86_400_000;
    format_iso_from_ms(ms)
}

fn format_iso_from_ms(ms: i64) -> String {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let date = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(ms as f64));
        format!(
            "{:04}-{:02}-{:02}",
            date.get_utc_full_year(),
            date.get_utc_month() + 1,
            date.get_utc_date()
        )
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        let _ = ms;
        "2026-06-18".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_provider_is_sentinel_hub() {
        let s = RemoteSensingSettings::default();
        assert_eq!(s.provider_id, DEFAULT_PROVIDER_ID);
        assert_eq!(s.collection_id, DEFAULT_COLLECTION_ID);
    }

    #[test]
    fn sentinel_hub_has_collections() {
        assert!(!collections_for("sentinel-hub").is_empty());
    }
}
