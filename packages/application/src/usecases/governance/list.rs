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

pub struct ListGovernanceProposalsUseCase {
    repo: Arc<dyn GovernanceRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListGovernanceProposalsUseCase {
    pub fn new(repo: Arc<dyn GovernanceRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        limit: u32,
    ) -> AppResult<Vec<GovernanceProposalView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.list_proposals(ctx, limit).await
    }
}

impl UseCaseDescriptor for ListGovernanceProposalsUseCase {
    const NAME: &'static str = "list_governance_proposals";
    const RESOURCE: &'static str = "governance";
    const ACTION: &'static str = "list";
}
