use serde::{Deserialize, Serialize};

const LAYER_STORAGE_KEY: &str = "geosyntra_gis_layers_v1";

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
    pub tile_url: Option<String>,
}

pub struct LayerStore;

impl LayerStore {
    pub fn defaults() -> Vec<AddedLayer> {
        vec![
            AddedLayer {
                id: "basemap".into(),
                name: "Satellite basemap".into(),
                kind: LayerKind::Basemap,
                visible: true,
                tile_url: None,
            },
            AddedLayer {
                id: "ndvi-demo".into(),
                name: "NDVI (demo WMS)".into(),
                kind: LayerKind::Indices,
                visible: false,
                tile_url: Some(
                    "https://services.sentinel-hub.com/ogc/wms/example?SERVICE=WMS&REQUEST=GetMap&LAYERS=NDVI&FORMAT=image/png&TRANSPARENT=true&VERSION=1.3.0&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256".into(),
                ),
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
                            return list;
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_layers_include_basemap() {
        assert!(LayerStore::defaults().iter().any(|l| l.kind == LayerKind::Basemap));
    }
}
