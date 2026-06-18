use serde::Deserialize;
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GrantRow {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub resource: String,
    pub action: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "expiresAt", default)]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ListGrantsResponse {
    grants: Vec<GrantRow>,
}

pub async fn list_grants(token: &str, tenant_id: &str) -> Result<Vec<GrantRow>, ApiError> {
    let client = ApiClient::from_env();
    let path = format!("/api/platform/grants?tenantId={tenant_id}");
    let data: ListGrantsResponse = client.get_json(&path, Some(token)).await?;
    Ok(data.grants)
}

pub async fn create_grant(
    token: &str,
    user_id: &str,
    tenant_id: &str,
    resource: &str,
    action: &str,
    expires_in_secs: i64,
    description: Option<&str>,
) -> Result<GrantRow, ApiError> {
    let client = ApiClient::from_env();
    let expires_at = expires_at_from_now(expires_in_secs);
    let body = json!({
        "userId": user_id,
        "tenantId": tenant_id,
        "resource": resource,
        "action": action,
        "description": description,
        "expiresAt": expires_at,
    });
    let resp: serde_json::Value = client
        .post_json("/api/platform/grants", &body, Some(token))
        .await?;
    serde_json::from_value(resp.get("grant").cloned().unwrap_or(json!({})))
        .map_err(|e| ApiError::Parse {
            message: e.to_string(),
        })
}

pub async fn revoke_grant(token: &str, id: &str) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let _: serde_json::Value = client
        .delete_json(&format!("/api/platform/grants/{id}"), Some(token))
        .await?;
    Ok(())
}

fn expires_at_from_now(secs: i64) -> i64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::new_0().get_time() / 1000.0) as i64 + secs
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64 + secs)
            .unwrap_or(secs)
    }
}
