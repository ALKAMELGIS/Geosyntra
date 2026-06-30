use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::policy::PolicyVersionSummaryView,
    error::AppResult,
    ports::PolicyRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ListPolicyVersionsUseCase {
    repo: Arc<dyn PolicyRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListPolicyVersionsUseCase {
    pub fn new(repo: Arc<dyn PolicyRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
    ) -> AppResult<Vec<PolicyVersionSummaryView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.list_versions(ctx).await
    }
}

impl UseCaseDescriptor for ListPolicyVersionsUseCase {
    const NAME: &'static str = "list_policy_versions";
    const RESOURCE: &'static str = "policy";
    const ACTION: &'static str = "list";
}
