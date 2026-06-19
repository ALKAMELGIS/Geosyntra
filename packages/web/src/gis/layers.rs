use serde::{Deserialize, Serialize};

const LAYER_STORAGE_KEY: &str = "geosyntra_gis_layers_v1";
const LAYER_SETTINGS_KEY: &str = "geosyntra_gis_layer_settings_v1";

pub const INDEX_RASTER_LAYER_ID: &str = "index-raster";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LayerKind {
    Basemap,
    Indices,
    Aoi,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AddedLayer {
    pub id: String,
    pub name: String,
    pub kind: LayerKind,
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tile_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayerSettings {
    pub active_index_id: String,
    #[serde(default)]
    pub layer_groups: Vec<String>,
}

impl Default for LayerSettings {
    fn default() -> Self {
        Self {
            active_index_id: crate::gis::index_catalog::DEFAULT_INDEX_ID.into(),
            layer_groups: Vec::new(),
        }
    }
}

pub struct LayerStore;

impl LayerStore {
    pub fn defaults() -> Vec<AddedLayer> {
        vec![
            AddedLayer {
                id: "basemap".into(),
                name: "Esri World Imagery".into(),
                kind: LayerKind::Basemap,
                visible: true,
                tile_url: None,
                group_name: None,
            },
            AddedLayer {
                id: INDEX_RASTER_LAYER_ID.into(),
                name: "NDVI".into(),
                kind: LayerKind::Indices,
                visible: false,
                tile_url: None,
                group_name: None,
            },
        ]
    }

    pub fn load(tenant_id: &str) -> Vec<AddedLayer> {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let key = format!("{LAYER_STORAGE_KEY}:{tenant_id}");
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    if let Ok(Some(raw)) = storage.get_item(&key) {
                        if let Ok(list) = serde_json::from_str(&raw) {
                            return migrate_layers(list);
                        }
                    }
                }
            }
        }
        Self::defaults()
    }

    pub fn save(tenant_id: &str, layers: &[AddedLayer]) {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let key = format!("{LAYER_STORAGE_KEY}:{tenant_id}");
            if let Ok(json) = serde_json::to_string(layers) {
                if let Some(window) = web_sys::window() {
                    if let Ok(Some(storage)) = window.local_storage() {
                        let _ = storage.set_item(&key, &json);
                    }
                }
            }
        }
        let _ = (tenant_id, layers);
    }

    pub fn load_settings(tenant_id: &str) -> LayerSettings {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let key = format!("{LAYER_SETTINGS_KEY}:{tenant_id}");
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
        LayerSettings::default()
    }

    pub fn save_settings(tenant_id: &str, settings: &LayerSettings) {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let key = format!("{LAYER_SETTINGS_KEY}:{tenant_id}");
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

fn migrate_layers(mut list: Vec<AddedLayer>) -> Vec<AddedLayer> {
    for layer in &mut list {
        if layer.id == "ndvi-demo" {
            layer.id = INDEX_RASTER_LAYER_ID.into();
        }
    }
    if !list.iter().any(|l| l.id == INDEX_RASTER_LAYER_ID) {
        list.push(AddedLayer {
            id: INDEX_RASTER_LAYER_ID.into(),
            name: "NDVI".into(),
            kind: LayerKind::Indices,
            visible: false,
            tile_url: None,
            group_name: None,
        });
    }
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_layers_include_basemap_and_index() {
        let defaults = LayerStore::defaults();
        assert!(defaults.iter().any(|l| l.kind == LayerKind::Basemap));
        assert!(defaults.iter().any(|l| l.id == INDEX_RASTER_LAYER_ID));
    }

    #[test]
    fn migrate_ndvi_demo_id() {
        let old = vec![AddedLayer {
            id: "ndvi-demo".into(),
            name: "NDVI".into(),
            kind: LayerKind::Indices,
            visible: true,
            tile_url: None,
            group_name: None,
        }];
        let migrated = migrate_layers(old);
        assert_eq!(migrated[0].id, INDEX_RASTER_LAYER_ID);
    }
}
