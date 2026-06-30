//! Upload staging model — React `uploadStagingModel.ts` (Task 32.3a).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UploadKind {
    GeoJson,
    Shapefile,
    Csv,
    Kml,
    Zip,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UploadStagingDataset {
    pub id: String,
    pub name: String,
    pub kind: UploadKind,
    pub size_bytes: u64,
    pub ready: bool,
    pub warning: Option<String>,
}

pub fn infer_kind(filename: &str) -> UploadKind {
    let lower = filename.to_ascii_lowercase();
    if lower.ends_with(".geojson") || lower.ends_with(".json") {
        UploadKind::GeoJson
    } else if lower.ends_with(".shp") || lower.ends_with(".dbf") || lower.ends_with(".shx") {
        UploadKind::Shapefile
    } else if lower.ends_with(".csv") {
        UploadKind::Csv
    } else if lower.ends_with(".kml") || lower.ends_with(".kmz") {
        UploadKind::Kml
    } else if lower.ends_with(".zip") {
        UploadKind::Zip
    } else {
        UploadKind::Unknown
    }
}

pub fn build_staging_datasets(files: &[(String, u64)]) -> Vec<UploadStagingDataset> {
    files
        .iter()
        .enumerate()
        .map(|(i, (name, size))| {
            let kind = infer_kind(name);
            let ready = !matches!(kind, UploadKind::Unknown);
            UploadStagingDataset {
                id: format!("upload-{i}"),
                name: name.clone(),
                kind,
                size_bytes: *size,
                ready,
                warning: if ready {
                    None
                } else {
                    Some("Unsupported format".into())
                },
            }
        })
        .collect()
}

pub fn all_datasets_ready(datasets: &[UploadStagingDataset]) -> bool {
    !datasets.is_empty() && datasets.iter().all(|d| d.ready)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_geojson() {
        assert_eq!(infer_kind("field.geojson"), UploadKind::GeoJson);
    }

    #[test]
    fn staging_marks_unknown_not_ready() {
        let ds = build_staging_datasets(&[("readme.txt".into(), 12)]);
        assert!(!ds[0].ready);
    }
}
