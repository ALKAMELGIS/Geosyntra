use domain::Name;
use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::role::view::RoleView,
    error::AppResult,
    ports::RoleRepository,
    projection::{fields::role::RoleField, RoleProjector},
    usecases::{field_sets::readable_role_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct GetRoleByNameUseCase<R: RoleRepository> {
    repo: R,
    auth: std::sync::Arc<dyn AuthorizationService>,
}

impl<R: RoleRepository> GetRoleByNameUseCase<R> {
    pub fn new(repo: R, auth: std::sync::Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        name: Name,
    ) -> AppResult<RoleView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        let access = authorize_use_case_with_fields::<Self, RoleField>(
            self.auth.as_ref(),
            &params,
            readable_role_fields,
        )?;
        let view = self.repo.fetch_view_by_name(ctx, name, &access).await?;
        Ok(RoleProjector::present(view, &access))
    }
}

impl<R: RoleRepository> UseCaseDescriptor for GetRoleByNameUseCase<R> {
    const NAME: &'static str = "get_role_by_name";
    const RESOURCE: &'static str = "role";
    const ACTION: &'static str = "read";
}
