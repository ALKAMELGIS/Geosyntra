use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::governance::CreateGovernanceProposalCommand,
    error::AppResult,
    ports::{AuditRepository, GovernanceRepository},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct CreateGovernanceProposalUseCase {
    repo: Arc<dyn GovernanceRepository>,
    audit: Arc<dyn AuditRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl CreateGovernanceProposalUseCase {
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
        command: CreateGovernanceProposalCommand,
    ) -> AppResult<crate::dto::governance::GovernanceProposalView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;

        let view = self.repo.create_proposal(ctx.clone(), command).await?;

        let details = serde_json::json!({
            "proposal_id": view.id,
            "type": view.proposal_type,
            "tenant_id": view.tenant_id,
            "payload_hash": view.payload_hash,
        })
        .to_string();

        self.audit
            .append(
                ctx.user_id().as_str(),
                "governance.proposal.created",
                Some(&view.id),
                Some(&details),
            )
            .await?;

        Ok(view)
    }
}

impl UseCaseDescriptor for CreateGovernanceProposalUseCase {
    const NAME: &'static str = "create_governance_proposal";
    const RESOURCE: &'static str = "governance";
    const ACTION: &'static str = "create";
}
