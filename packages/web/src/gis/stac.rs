//! STAC catalog search — React SI STAC block subset (Task 32.3d).

use serde::{Deserialize, Serialize};

pub const DEFAULT_STAC_API: &str = "https://planetarycomputer.microsoft.com/api/stac/v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StacCollection {
    pub id: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StacItem {
    pub id: String,
    pub collection: String,
    pub datetime: String,
    pub bbox: Option<[f64; 4]>,
    pub thumbnail: Option<String>,
}

pub fn demo_collections() -> Vec<StacCollection> {
    vec![
        StacCollection {
            id: "sentinel-2-l2a".into(),
            title: "Sentinel-2 L2A".into(),
            description: "Surface reflectance — 10m multispectral".into(),
        },
        StacCollection {
            id: "sentinel-1-grd".into(),
            title: "Sentinel-1 GRD".into(),
            description: "SAR ground range detected".into(),
        },
        StacCollection {
            id: "landsat-c2-l2".into(),
            title: "Landsat Collection 2 L2".into(),
            description: "USGS Landsat surface reflectance".into(),
        },
    ]
}

pub fn search_items(collection_id: &str, bbox: Option<[f64; 4]>, limit: usize) -> Vec<StacItem> {
    let bbox = bbox.unwrap_or([53.0, 22.0, 54.0, 23.0]);
    (0..limit.min(12))
        .map(|i| StacItem {
            id: format!("{collection_id}-item-{i}"),
            collection: collection_id.into(),
            datetime: format!("2026-01-{:02}T12:00:00Z", (i % 28) + 1),
            bbox: Some(bbox),
            thumbnail: None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_collections_non_empty() {
        assert!(!demo_collections().is_empty());
    }

    #[test]
    fn search_respects_limit() {
        assert_eq!(search_items("sentinel-2-l2a", None, 3).len(), 3);
    }
}
