use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    command_appliers::UserCommandApplier,
    dto::user::{command::UserCommand, view::UserView},
    error::{AppError, AppResult},
    ports::{UserIdAllocator, UserRepository},
    projection::{fields::user::UserField, UserProjector},
    usecases::{field_sets::readable_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct CreateUserUseCase {
    repo: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
    ids: Option<Arc<dyn UserIdAllocator>>,
}

impl CreateUserUseCase {
    pub fn new(repo: Arc<dyn UserRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self {
            repo,
            auth,
            ids: None,
        }
    }

    pub fn with_id_allocator(mut self, ids: Arc<dyn UserIdAllocator>) -> Self {
        self.ids = Some(ids);
        self
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        input: UserCommand,
    ) -> AppResult<UserView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        let access = authorize_use_case_with_fields::<Self, UserField>(
            self.auth.as_ref(),
            &params,
            readable_user_fields,
        )?;
        let id = match input.id.clone() {
            Some(id) => id,
            None => match &self.ids {
                Some(alloc) => alloc.allocate().await?,
                None => {
                    return Err(AppError::ValidationError("user id required".into()));
                }
            },
        };
        let role_display = input.role_display.clone();
        let user = UserCommandApplier::from_create(id.clone(), input)?;
        self.repo
            .insert(ctx.clone(), user, role_display)
            .await?;
        let view = self.repo.fetch_view_by_id(ctx, id, &access).await?;
        Ok(UserProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for CreateUserUseCase {
    const NAME: &'static str = "create_user";
    const RESOURCE: &'static str = "user";
    const ACTION: &'static str = "create";
}
