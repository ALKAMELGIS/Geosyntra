use serde_json::Value;

use crate::{
    dto::governance::{CreateGovernanceProposalCommand, GovernanceProposalView, RejectGovernanceProposalCommand},
    error::AppResult,
    SubjectContext,
};

#[async_trait::async_trait]
pub trait GovernanceRepository: Send + Sync {
    async fn create_proposal(
        &self,
        ctx: SubjectContext,
        command: CreateGovernanceProposalCommand,
    ) -> AppResult<GovernanceProposalView>;

    async fn get_proposal(
        &self,
        ctx: SubjectContext,
        proposal_id: &str,
    ) -> AppResult<GovernanceProposalView>;

    async fn list_proposals(
        &self,
        ctx: SubjectContext,
        limit: u32,
    ) -> AppResult<Vec<GovernanceProposalView>>;

    async fn pending_count(&self, ctx: SubjectContext) -> AppResult<u32>;

    async fn approve(
        &self,
        ctx: SubjectContext,
        proposal_id: &str,
    ) -> AppResult<GovernanceProposalView>;

    async fn reject(
        &self,
        ctx: SubjectContext,
        proposal_id: &str,
        command: RejectGovernanceProposalCommand,
    ) -> AppResult<GovernanceProposalView>;

    async fn mark_applied(
        &self,
        proposal_id: &str,
        result_id: Option<&str>,
    ) -> AppResult<GovernanceProposalView>;
}

pub fn payload_hash(payload: &Value) -> String {
    use sha2::{Digest, Sha256};
    let canonical = serde_json::to_string(payload).unwrap_or_default();
    hex::encode(Sha256::digest(canonical.as_bytes()))
}

#[async_trait::async_trait]
pub trait TenantBootstrapService: Send + Sync {
    async fn bootstrap_new_tenant(&self, tenant_id: &str) -> AppResult<()>;
}
