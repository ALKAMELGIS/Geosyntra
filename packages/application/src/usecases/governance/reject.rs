use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::governance::{GovernanceProposalView, RejectGovernanceProposalCommand},
    error::AppResult,
    ports::{AuditRepository, GovernanceRepository},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct RejectGovernanceProposalUseCase {
    repo: Arc<dyn GovernanceRepository>,
    audit: Arc<dyn AuditRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl RejectGovernanceProposalUseCase {
    pub fn new(
        repo: Arc<dyn GovernanceRepository>,
        audit: Arc<dyn AuditRepository>,
        auth: Arc<dyn AuthorizationService>,
    ) -> Self {
        Self { repo, audit, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        proposal_id: &str,
        command: RejectGovernanceProposalCommand,
    ) -> AppResult<GovernanceProposalView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;

        let view = self
            .repo
            .reject(ctx.clone(), proposal_id, command)
            .await?;

        let details = serde_json::json!({
            "proposal_id": view.id,
            "reason_code": view.rejection_reason_code,
            "reason_text": view.rejection_reason_text,
        })
        .to_string();

        self.audit
            .append(
                ctx.user_id().as_str(),
                "governance.proposal.rejected",
                Some(proposal_id),
                Some(&details),
            )
            .await?;

        Ok(view)
    }
}

impl UseCaseDescriptor for RejectGovernanceProposalUseCase {
    const NAME: &'static str = "reject_governance_proposal";
    const RESOURCE: &'static str = "governance";
    const ACTION: &'static str = "reject";
}
