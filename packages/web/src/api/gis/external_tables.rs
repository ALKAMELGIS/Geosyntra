//! GIS external tables + relationships API client — Task 32.0 / FD-1.

use serde_json::Value;

use crate::{api_client::ApiClient, error_display::ApiError};

pub async fn list_external_tables(token: Option<&str>) -> Result<Value, ApiError> {
    ApiClient::from_env()
        .get_json("/api/gis/external-tables", token)
        .await
}

pub async fn list_table_rows(
    table: &str,
    token: Option<&str>,
) -> Result<Value, ApiError> {
    let path = format!("/api/gis/external-tables/{table}/rows");
    ApiClient::from_env().get_json(&path, token).await
}

pub async fn list_relationships(token: Option<&str>) -> Result<Value, ApiError> {
    ApiClient::from_env()
        .get_json("/api/gis/relationships", token)
        .await
}

pub async fn resolve_relationships(body: &Value, token: Option<&str>) -> Result<Value, ApiError> {
    ApiClient::from_env()
        .post_json("/api/gis/resolve", body, token)
        .await
}
