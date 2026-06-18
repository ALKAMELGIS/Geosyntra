use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::tenant::view::TenantView,
    error::AppResult,
    ports::TenantRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ListTenantsUseCase {
    repo: Arc<dyn TenantRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListTenantsUseCase {
    pub fn new(repo: Arc<dyn TenantRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<TenantView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo
            .get_tenants_paginated(ctx, &[], page, page_size)
            .await
    }
}

impl UseCaseDescriptor for ListTenantsUseCase {
    const NAME: &'static str = "list_tenants";
    const RESOURCE: &'static str = "tenant";
    const ACTION: &'static str = "list";
}
