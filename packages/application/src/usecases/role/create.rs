use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    command_appliers::RoleCommandApplier,
    dto::role::{command::RoleCommand, view::RoleView},
    error::AppResult,
    ports::RoleRepository,
    projection::{fields::role::RoleField, RoleProjector},
    usecases::{field_sets::readable_role_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct CreateRoleUseCase<R: RoleRepository> {
    repo: R,
    auth: std::sync::Arc<dyn AuthorizationService>,
}

impl<R: RoleRepository> CreateRoleUseCase<R> {
    pub fn new(repo: R, auth: std::sync::Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        input: RoleCommand,
    ) -> AppResult<RoleView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        let access = authorize_use_case_with_fields::<Self, RoleField>(
            self.auth.as_ref(),
            &params,
            readable_role_fields,
        )?;
        let id = input
            .id
            .clone()
            .ok_or(domain::DomainError::ValidationError("Role id required".into()))?;
        let role = RoleCommandApplier::from_create(input)?;
        self.repo.insert(ctx.clone(), role).await?;
        let view = self.repo.fetch_view_by_id(ctx, id, &access).await?;
        Ok(RoleProjector::present(view, &access))
    }
}

impl<R: RoleRepository> UseCaseDescriptor for CreateRoleUseCase<R> {
    const NAME: &'static str = "create_role";
    const RESOURCE: &'static str = "role";
    const ACTION: &'static str = "create";
}
