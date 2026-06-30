use std::sync::Arc;

use domain::{tenant::environment::Environment, TenantId};

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::tenant::view::TemporaryGrantView,
    error::AppResult,
    ports::TemporaryGrantRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ListTemporaryGrantsUseCase {
    repo: Arc<dyn TemporaryGrantRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListTemporaryGrantsUseCase {
    pub fn new(repo: Arc<dyn TemporaryGrantRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        tenant_id: TenantId,
        limit: u32,
    ) -> AppResult<Vec<TemporaryGrantView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.fetch_views_by_tenant(ctx, tenant_id, limit).await
    }
}

impl UseCaseDescriptor for ListTemporaryGrantsUseCase {
    const NAME: &'static str = "list_temporary_grants";
    const RESOURCE: &'static str = "temporary_grant";
    const ACTION: &'static str = "list";
}
