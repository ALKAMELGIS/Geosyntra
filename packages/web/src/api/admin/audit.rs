use serde::Deserialize;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct AuditEntry {
    pub at: Option<String>,
    pub actor: Option<String>,
    pub action: Option<String>,
    pub target: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListAuditResponse {
    audit: Vec<AuditEntry>,
}

pub async fn list_audit(token: &str, limit: u32) -> Result<Vec<AuditEntry>, ApiError> {
    let client = ApiClient::from_env();
    let path = format!("/api/rbac/audit?limit={limit}");
    let data: ListAuditResponse = client.get_json(&path, Some(token)).await?;
    Ok(data.audit)
}
