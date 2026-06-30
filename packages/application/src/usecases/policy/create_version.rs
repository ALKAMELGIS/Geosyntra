use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::policy::{CreatePolicyVersionCommand, PolicyVersionId},
    error::AppResult,
    ports::PolicyRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct CreatePolicyVersionUseCase {
    repo: Arc<dyn PolicyRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl CreatePolicyVersionUseCase {
    pub fn new(repo: Arc<dyn PolicyRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        command: CreatePolicyVersionCommand,
    ) -> AppResult<PolicyVersionId> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.create_version(ctx, command).await
    }
}

impl UseCaseDescriptor for CreatePolicyVersionUseCase {
    const NAME: &'static str = "create_policy_version";
    const RESOURCE: &'static str = "policy";
    const ACTION: &'static str = "create";
}
