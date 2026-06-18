use serde::Deserialize;
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct MembershipRow {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    pub roles: Vec<String>,
    #[serde(rename = "roleDisplay", default)]
    pub role_display: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListMembershipsResponse {
    memberships: Vec<MembershipRow>,
}

pub async fn list_memberships(
    token: &str,
    tenant_id: &str,
) -> Result<Vec<MembershipRow>, ApiError> {
    let client = ApiClient::from_env();
    let path = format!("/api/platform/memberships?tenantId={tenant_id}");
    let data: ListMembershipsResponse = client.get_json(&path, Some(token)).await?;
    Ok(data.memberships)
}

pub async fn create_membership(
    token: &str,
    user_id: &str,
    tenant_id: &str,
    role_slugs: &[String],
) -> Result<MembershipRow, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "userId": user_id,
        "tenantId": tenant_id,
        "roleSlugs": role_slugs,
    });
    let resp: serde_json::Value = client
        .post_json("/api/platform/memberships", &body, Some(token))
        .await?;
    serde_json::from_value(resp.get("membership").cloned().unwrap_or(json!({})))
        .map_err(|e| ApiError::Parse {
            message: e.to_string(),
        })
}

pub async fn update_role(
    token: &str,
    user_id: &str,
    tenant_id: &str,
    role_slugs: &[String],
) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "roleSlugs": role_slugs });
    let _: serde_json::Value = client
        .patch_json(
            &format!("/api/platform/memberships/{user_id}/{tenant_id}"),
            &body,
            Some(token),
        )
        .await?;
    Ok(())
}

pub async fn delete_membership(
    token: &str,
    user_id: &str,
    tenant_id: &str,
) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let _: serde_json::Value = client
        .delete_json(
            &format!("/api/platform/memberships/{user_id}/{tenant_id}"),
            Some(token),
        )
        .await?;
    Ok(())
}
