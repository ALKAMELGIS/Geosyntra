use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::governance::GovernanceProposalView,
    error::AppResult,
    ports::GovernanceRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct GetGovernanceProposalUseCase {
    repo: Arc<dyn GovernanceRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetGovernanceProposalUseCase {
    pub fn new(repo: Arc<dyn GovernanceRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        proposal_id: &str,
    ) -> AppResult<GovernanceProposalView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.get_proposal(ctx, proposal_id).await
    }
}

pub struct PendingGovernanceCountUseCase {
    repo: Arc<dyn GovernanceRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl PendingGovernanceCountUseCase {
    pub fn new(repo: Arc<dyn GovernanceRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
    ) -> AppResult<u32> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.pending_count(ctx).await
    }
}

impl UseCaseDescriptor for GetGovernanceProposalUseCase {
    const NAME: &'static str = "get_governance_proposal";
    const RESOURCE: &'static str = "governance";
    const ACTION: &'static str = "read";
}

impl UseCaseDescriptor for PendingGovernanceCountUseCase {
    const NAME: &'static str = "pending_governance_count";
    const RESOURCE: &'static str = "governance";
    const ACTION: &'static str = "read";
}
