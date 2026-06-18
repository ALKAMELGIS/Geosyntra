use std::sync::Arc;

use domain::{tenant::environment::Environment, TenantId};

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::tenant::view::TenantView,
    error::AppResult,
    ports::TenantRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct GetTenantUseCase {
    repo: Arc<dyn TenantRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetTenantUseCase {
    pub fn new(repo: Arc<dyn TenantRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        tenant_id: TenantId,
    ) -> AppResult<TenantView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.get_by_id(ctx, tenant_id).await
    }
}

impl UseCaseDescriptor for GetTenantUseCase {
    const NAME: &'static str = "get_tenant";
    const RESOURCE: &'static str = "tenant";
    const ACTION: &'static str = "read";
}
