use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::policy::{PolicyVersionId, UpdatePolicyVersionCommand},
    error::AppResult,
    ports::PolicyRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct UpdatePolicyVersionUseCase {
    repo: Arc<dyn PolicyRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl UpdatePolicyVersionUseCase {
    pub fn new(repo: Arc<dyn PolicyRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        id: PolicyVersionId,
        command: UpdatePolicyVersionCommand,
    ) -> AppResult<()> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.update_version(ctx, id, command).await
    }
}

impl UseCaseDescriptor for UpdatePolicyVersionUseCase {
    const NAME: &'static str = "update_policy_version";
    const RESOURCE: &'static str = "policy";
    const ACTION: &'static str = "update";
}
