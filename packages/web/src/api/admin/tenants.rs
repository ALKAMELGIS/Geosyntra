use serde::Deserialize;
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct TenantRow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "isPlatformTenant", default)]
    pub is_platform_tenant: bool,
    #[serde(rename = "createdAt", default)]
    pub created_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ListTenantsResponse {
    tenants: Vec<TenantRow>,
}

#[derive(Debug, Deserialize)]
pub struct GovernanceProposalResponse {
    #[serde(rename = "governanceRequired", default)]
    pub governance_required: bool,
    #[serde(rename = "proposalId")]
    pub proposal_id: String,
    #[serde(rename = "requiredApprovals", default)]
    pub required_approvals: u32,
}

pub async fn list_tenants(token: &str) -> Result<Vec<TenantRow>, ApiError> {
    let client = ApiClient::from_env();
    let data: ListTenantsResponse = client
        .get_json("/api/platform/tenants", Some(token))
        .await?;
    Ok(data.tenants)
}

pub async fn propose_create(
    token: &str,
    id: &str,
    name: &str,
    description: Option<&str>,
    config: Option<&serde_json::Value>,
) -> Result<GovernanceProposalResponse, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "id": id,
        "name": name,
        "description": description,
        "config": config,
    });
    client
        .post_json("/api/platform/tenants", &body, Some(token))
        .await
}

pub async fn propose_update(
    token: &str,
    id: &str,
    name: &str,
    description: Option<&str>,
    config: Option<&serde_json::Value>,
) -> Result<GovernanceProposalResponse, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "name": name,
        "description": description,
        "config": config,
    });
    client
        .post_json(
            &format!("/api/platform/tenants/{id}/propose-update"),
            &body,
            Some(token),
        )
        .await
}
