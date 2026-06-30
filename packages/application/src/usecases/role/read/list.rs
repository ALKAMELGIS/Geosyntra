use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::role::view::RoleView,
    error::AppResult,
    ports::{sort::RoleSortBy, RoleRepository},
    projection::{fields::role::RoleField, RoleProjector},
    usecases::{field_sets::readable_role_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct ListRoleUseCase<R: RoleRepository> {
    repo: R,
    auth: std::sync::Arc<dyn AuthorizationService>,
}

impl<R: RoleRepository> ListRoleUseCase<R> {
    pub fn new(repo: R, auth: std::sync::Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        sort_by: &[RoleSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<RoleView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        let access = authorize_use_case_with_fields::<Self, RoleField>(
            self.auth.as_ref(),
            &params,
            readable_role_fields,
        )?;
        let rows = self
            .repo
            .fetch_views_paginated(ctx, &access, sort_by, page, page_size)
            .await?;
        Ok(rows
            .into_iter()
            .map(|view| RoleProjector::present(view, &access))
            .collect())
    }
}

impl<R: RoleRepository> UseCaseDescriptor for ListRoleUseCase<R> {
    const NAME: &'static str = "list_role";
    const RESOURCE: &'static str = "role";
    const ACTION: &'static str = "list";
}
