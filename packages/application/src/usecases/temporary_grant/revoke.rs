use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    error::AppResult,
    ports::TemporaryGrantRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct RevokeTemporaryGrantUseCase {
    repo: Arc<dyn TemporaryGrantRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl RevokeTemporaryGrantUseCase {
    pub fn new(repo: Arc<dyn TemporaryGrantRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        grant_id: &str,
    ) -> AppResult<bool> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.revoke(ctx, grant_id).await
    }
}

impl UseCaseDescriptor for RevokeTemporaryGrantUseCase {
    const NAME: &'static str = "revoke_temporary_grant";
    const RESOURCE: &'static str = "temporary_grant";
    const ACTION: &'static str = "delete";
}
