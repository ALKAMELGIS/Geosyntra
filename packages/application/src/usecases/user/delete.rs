use std::sync::Arc;

use domain::tenant::environment::Environment;
use domain::{TenantId, UserId};

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    error::AppResult,
    ports::UserRepository,
    usecases::{field_sets::readable_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct DeleteUserUseCase {
    repo: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl DeleteUserUseCase {
    pub fn new(repo: Arc<dyn UserRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        resource_tenant: &TenantId,
        user_id: UserId,
    ) -> AppResult<bool> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(resource_tenant)
            .with_target_user_id(&user_id);
        let _access = authorize_use_case_with_fields::<Self, _>(
            self.auth.as_ref(),
            &params,
            readable_user_fields,
        )?;
        self.repo.delete_by_id(ctx, user_id).await
    }
}

impl UseCaseDescriptor for DeleteUserUseCase {
    const NAME: &'static str = "delete_user";
    const RESOURCE: &'static str = "user";
    const ACTION: &'static str = "delete";
}
