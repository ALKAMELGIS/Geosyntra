use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GovernanceProposalView {
    pub id: String,
    pub tenant_id: String,
    pub proposal_type: String,
    pub payload: Value,
    pub payload_hash: String,
    pub status: String,
    pub required_approvals: u32,
    pub proposer_user_id: String,
    pub rejection_reason_code: Option<String>,
    pub rejection_reason_text: Option<String>,
    pub approval_count: u32,
    pub approver_ids: Vec<String>,
    pub created_at: i64,
    pub expires_at: i64,
    pub reviewable_after: i64,
    pub applied_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateGovernanceProposalCommand {
    pub proposal_type: String,
    pub tenant_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RejectGovernanceProposalCommand {
    pub reason_code: String,
    pub reason_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GovernanceApplyResult {
    pub proposal_id: String,
    pub result_id: Option<String>,
    pub applied: bool,
}

pub const GOVERNANCE_REQUIRED_APPROVALS: u32 = 3;
pub const GOVERNANCE_REVIEW_WINDOW_SECS: i64 = 15 * 60;
pub const GOVERNANCE_TTL_SECS: i64 = 7 * 24 * 60 * 60;

pub const REJECTION_REASONS: &[&str] = &[
    "incorrect_payload",
    "security_concern",
    "duplicate",
    "other",
];
