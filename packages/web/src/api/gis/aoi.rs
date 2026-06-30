use serde_json::Value;

use crate::{api_client::ApiClient, error_display::ApiError};

pub async fn list_aoi(token: &str) -> Result<Vec<Value>, ApiError> {
    let client = ApiClient::from_env();
    client.get_json("/api/aoi", Some(token)).await
}

pub async fn upsert_aoi(body: &Value, token: &str) -> Result<Value, ApiError> {
    let client = ApiClient::from_env();
    client.post_json("/api/aoi", body, Some(token)).await
}

pub async fn delete_aoi(id: &str, token: &str) -> Result<Value, ApiError> {
    let client = ApiClient::from_env();
    client
        .delete_json(&format!("/api/aoi/{id}"), Some(token))
        .await
}
