use std::sync::Arc;

use domain::tenant::environment::Environment;
use domain::UserId;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::user::view::UserView,
    error::AppResult,
    ports::UserRepository,
    projection::{fields::user::UserField, UserProjector},
    usecases::{field_sets::readable_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct GetUserByIdUseCase {
    repo: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetUserByIdUseCase {
    pub fn new(repo: Arc<dyn UserRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        id: UserId,
    ) -> AppResult<UserView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id())
            .with_target_user_id(&id);
        let access = authorize_use_case_with_fields::<Self, UserField>(
            self.auth.as_ref(),
            &params,
            readable_user_fields,
        )?;
        let view = self.repo.fetch_view_by_id(ctx, id, &access).await?;
        Ok(UserProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for GetUserByIdUseCase {
    const NAME: &'static str = "get_user_by_id";
    const RESOURCE: &'static str = "user";
    const ACTION: &'static str = "read";
}
