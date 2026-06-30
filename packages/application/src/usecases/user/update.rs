use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    command_appliers::UserCommandApplier,
    dto::user::{command::UserCommand, view::UserView},
    error::{AppError, AppResult},
    ports::UserRepository,
    projection::{fields::user::UserField, UserProjector},
    usecases::{field_sets::readable_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct UpdateUserUseCase {
    repo: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl UpdateUserUseCase {
    pub fn new(repo: Arc<dyn UserRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        input: UserCommand,
    ) -> AppResult<UserView> {
        let id = input
            .id
            .clone()
            .ok_or_else(|| AppError::ValidationError("user id required".into()))?;
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id())
            .with_target_user_id(&id);
        let access = authorize_use_case_with_fields::<Self, UserField>(
            self.auth.as_ref(),
            &params,
            readable_user_fields,
        )?;
        let user = self.repo.get_for_update(ctx.clone(), id.clone()).await?;
        let updated = UserCommandApplier::apply_update(user, &input)?;
        self.repo.save(ctx.clone(), updated).await?;
        let view = self.repo.fetch_view_by_id(ctx, id, &access).await?;
        Ok(UserProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for UpdateUserUseCase {
    const NAME: &'static str = "update_user";
    const RESOURCE: &'static str = "user";
    const ACTION: &'static str = "update";
}
