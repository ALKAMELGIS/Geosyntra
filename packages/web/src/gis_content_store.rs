use serde::{Deserialize, Serialize};

pub const STORAGE_KEY: &str = "geosyntra.gisContent.portal.v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GisContentRow {
    pub id: String,
    pub title: String,
    #[serde(rename = "typeLabel")]
    pub type_label: String,
    pub modified: String,
    #[serde(rename = "folderId")]
    pub folder_id: String,
    pub sharing: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
struct PortalPersist {
    rows: Vec<GisContentRow>,
}

pub fn demo_rows() -> Vec<GisContentRow> {
    vec![
        GisContentRow {
            id: "1".into(),
            title: "Regional NDVI Dashboard".into(),
            type_label: "Dashboard".into(),
            modified: "2026-06-01".into(),
            folder_id: "all".into(),
            sharing: "private".into(),
        },
        GisContentRow {
            id: "2".into(),
            title: "Irrigation Zones Web Map".into(),
            type_label: "Web Map".into(),
            modified: "2026-05-28".into(),
            folder_id: "all".into(),
            sharing: "organization".into(),
        },
        GisContentRow {
            id: "3".into(),
            title: "Field Boundaries Layer".into(),
            type_label: "Feature Layer".into(),
            modified: "2026-05-20".into(),
            folder_id: "all".into(),
            sharing: "shared".into(),
        },
        GisContentRow {
            id: "4".into(),
            title: "Sentinel-2 Scene Explorer".into(),
            type_label: "Instant App".into(),
            modified: "2026-05-15".into(),
            folder_id: "all".into(),
            sharing: "private".into(),
        },
    ]
}

pub fn load_rows() -> Vec<GisContentRow> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(Some(raw)) = storage.get_item(STORAGE_KEY) {
                    if let Ok(parsed) = serde_json::from_str::<PortalPersist>(&raw) {
                        if !parsed.rows.is_empty() {
                            return parsed.rows;
                        }
                    }
                }
            }
        }
    }
    demo_rows()
}

pub fn save_rows(rows: &[GisContentRow]) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        let payload = PortalPersist {
            rows: rows.to_vec(),
        };
        if let Ok(raw) = serde_json::to_string(&payload) {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item(STORAGE_KEY, &raw);
                }
            }
        }
    }
    let _ = rows;
}

pub fn find_row(id: &str) -> Option<GisContentRow> {
    load_rows().into_iter().find(|r| r.id == id)
}

pub fn create_folder(rows: &mut Vec<GisContentRow>, title: &str) -> GisContentRow {
    let id = format!("folder-{}", crate::wall_clock::now_ms());
    let row = GisContentRow {
        id: id.clone(),
        title: title.into(),
        type_label: "Folder".into(),
        modified: crate::gis::iso_today(),
        folder_id: "all".into(),
        sharing: "private".into(),
    };
    rows.push(row.clone());
    row
}

pub fn move_rows_to_folder(rows: &mut [GisContentRow], ids: &[&str], folder_id: &str) {
    for row in rows.iter_mut() {
        if ids.contains(&row.id.as_str()) {
            row.folder_id = folder_id.into();
        }
    }
}

pub fn set_sharing(rows: &mut [GisContentRow], id: &str, sharing: &str) {
    if let Some(row) = rows.iter_mut().find(|r| r.id == id) {
        row.sharing = sharing.into();
    }
}
