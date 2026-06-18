use domain::tenant::environment::Environment;
use domain::RoleId;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    error::AppResult,
    ports::RoleRepository,
    usecases::{field_sets::readable_role_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct DeleteRoleUseCase<R: RoleRepository> {
    repo: R,
    auth: std::sync::Arc<dyn AuthorizationService>,
}

impl<R: RoleRepository> DeleteRoleUseCase<R> {
    pub fn new(repo: R, auth: std::sync::Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        id: RoleId,
    ) -> AppResult<bool> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        let _access = authorize_use_case_with_fields::<Self, _>(
            self.auth.as_ref(),
            &params,
            readable_role_fields,
        )?;
        self.repo.delete_by_id(ctx, id).await
    }
}

impl<R: RoleRepository> UseCaseDescriptor for DeleteRoleUseCase<R> {
    const NAME: &'static str = "delete_role";
    const RESOURCE: &'static str = "role";
    const ACTION: &'static str = "delete";
}
