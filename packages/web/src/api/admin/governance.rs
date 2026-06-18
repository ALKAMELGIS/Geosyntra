use serde::Deserialize;
use serde_json::{json, Value};

use crate::{api_client::ApiClient, error_display::ApiError};

pub const REJECTION_REASONS: &[(&str, &str)] = &[
    ("incorrect_payload", "Incorrect payload"),
    ("security_concern", "Security concern"),
    ("duplicate", "Duplicate proposal"),
    ("other", "Other"),
];

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GovernanceProposal {
    pub id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    #[serde(rename = "proposalType")]
    pub proposal_type: String,
    pub payload: Value,
    #[serde(rename = "payloadHash", default)]
    pub payload_hash: Option<String>,
    pub status: String,
    #[serde(rename = "requiredApprovals", default)]
    pub required_approvals: u32,
    #[serde(rename = "proposerUserId")]
    pub proposer_user_id: String,
    #[serde(rename = "approvalCount", default)]
    pub approval_count: u32,
    #[serde(default, rename = "approverIds")]
    pub approver_ids: Vec<String>,
    #[serde(rename = "rejectionReasonCode", default)]
    pub rejection_reason_code: Option<String>,
    #[serde(rename = "createdAt", default)]
    pub created_at: i64,
    #[serde(rename = "reviewableAfter", default)]
    pub reviewable_after: i64,
    #[serde(rename = "expiresAt", default)]
    pub expires_at: i64,
}

#[derive(Debug, Deserialize)]
struct ListResponse {
    proposals: Vec<GovernanceProposal>,
}

#[derive(Debug, Deserialize)]
struct CountResponse {
    count: u32,
}

#[derive(Debug, Deserialize)]
struct ProposalResponse {
    proposal: GovernanceProposal,
}

pub async fn list_proposals(token: &str, limit: u32) -> Result<Vec<GovernanceProposal>, ApiError> {
    let client = ApiClient::from_env();
    let path = format!("/api/governance/proposals?limit={limit}");
    let data: ListResponse = client.get_json(&path, Some(token)).await?;
    Ok(data.proposals)
}

pub async fn pending_count(token: &str) -> Result<u32, ApiError> {
    let client = ApiClient::from_env();
    let data: CountResponse = client
        .get_json("/api/governance/proposals/pending-count", Some(token))
        .await?;
    Ok(data.count)
}

pub async fn approve_proposal(token: &str, id: &str) -> Result<GovernanceProposal, ApiError> {
    let client = ApiClient::from_env();
    let data: ProposalResponse = client
        .post_empty(&format!("/api/governance/proposals/{id}/approve"), Some(token))
        .await?;
    Ok(data.proposal)
}

pub async fn reject_proposal(
    token: &str,
    id: &str,
    reason_code: &str,
    reason_text: Option<&str>,
) -> Result<GovernanceProposal, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "reason_code": reason_code,
        "reason_text": reason_text,
    });
    let data: ProposalResponse = client
        .post_json(
            &format!("/api/governance/proposals/{id}/reject"),
            &body,
            Some(token),
        )
        .await?;
    Ok(data.proposal)
}

pub fn proposal_summary(proposal: &GovernanceProposal) -> String {
    match proposal.proposal_type.as_str() {
        "tenant.create" => payload_field(&proposal.payload, "id")
            .map(|id| format!("Create tenant {id}"))
            .unwrap_or_else(|| "Create tenant".into()),
        "tenant.update" => payload_field(&proposal.payload, "name")
            .map(|name| format!("Rename tenant to {name}"))
            .unwrap_or_else(|| "Update tenant".into()),
        "policy.create" => "Create policy version".into(),
        "policy.activate" => payload_field(&proposal.payload, "policyId")
            .map(|id| format!("Activate policy {id}"))
            .unwrap_or_else(|| "Activate policy".into()),
        "config.update" => "Update platform config".into(),
        other => other.replace('.', " "),
    }
}

fn payload_field(payload: &Value, key: &str) -> Option<String> {
    payload.get(key).and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}
