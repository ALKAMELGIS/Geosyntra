//! Planetary Computer STAC client — live catalog search (Task 32.3d).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{api_client::ApiClient, error_display::ApiError};

use crate::gis::{StacCollection, StacItem, DEFAULT_STAC_API};

#[derive(Debug, Deserialize)]
struct StacCollectionsResponse {
    #[serde(default)]
    collections: Vec<StacCollectionRecord>,
}

#[derive(Debug, Deserialize)]
struct StacCollectionRecord {
    id: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StacSearchResponse {
    #[serde(default)]
    features: Vec<StacFeature>,
}

#[derive(Debug, Deserialize)]
struct StacFeature {
    id: String,
    #[serde(default)]
    collection: Option<String>,
    #[serde(default)]
    properties: Option<StacFeatureProps>,
    #[serde(default)]
    bbox: Option<Vec<f64>>,
    #[serde(default)]
    assets: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct StacFeatureProps {
    #[serde(default)]
    datetime: Option<String>,
}

async fn fetch_json(url: &str) -> Result<Value, ApiError> {
    let client = ApiClient::from_env();
    client.get_json(url, None).await
}

/// Load STAC collections from Planetary Computer (public API).
pub async fn fetch_collections() -> Result<Vec<StacCollection>, ApiError> {
    let url = format!("{DEFAULT_STAC_API}/collections?limit=50");
    let raw: Value = fetch_json(&url).await?;
    let body: StacCollectionsResponse = serde_json::from_value(raw).map_err(|err| ApiError::Parse {
        message: format!("invalid STAC collections JSON: {err}"),
    })?;
    Ok(body
        .collections
        .into_iter()
        .map(|c| StacCollection {
            id: c.id.clone(),
            title: c.title.unwrap_or_else(|| c.id.clone()),
            description: c.description.unwrap_or_default(),
        })
        .collect())
}

/// Search STAC items for a collection + optional bbox.
pub async fn search_items_live(
    collection_id: &str,
    bbox: Option<[f64; 4]>,
    limit: usize,
) -> Result<Vec<StacItem>, ApiError> {
    let client = ApiClient::from_env();
    let mut body = json!({
        "collections": [collection_id],
        "limit": limit.min(50),
    });
    if let Some(b) = bbox {
        body["bbox"] = json!(b);
    }
    let url = format!("{DEFAULT_STAC_API}/search");
    let resp: StacSearchResponse = client.post_json(&url, &body, None).await?;
    Ok(resp
        .features
        .into_iter()
        .map(|f| {
            let datetime = f
                .properties
                .and_then(|p| p.datetime)
                .unwrap_or_else(|| "—".into());
            let bbox = f.bbox.and_then(|b| {
                if b.len() >= 4 {
                    Some([b[0], b[1], b[2], b[3]])
                } else {
                    None
                }
            });
            let thumbnail = f.assets.as_ref().and_then(|assets| {
                assets
                    .get("thumbnail")
                    .or_else(|| assets.get("rendered_preview"))
                    .and_then(|a| a.get("href"))
                    .and_then(|h| h.as_str())
                    .map(str::to_string)
            });
            StacItem {
                id: f.id,
                collection: f.collection.unwrap_or_else(|| collection_id.into()),
                datetime,
                bbox,
                thumbnail,
            }
        })
        .collect())
}
