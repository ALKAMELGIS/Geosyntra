use std::sync::Arc;

use domain::tenant::environment::Environment;
use domain::Email;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::user::view::UserView,
    error::AppResult,
    ports::UserRepository,
    projection::{fields::user::UserField, UserProjector},
    usecases::{field_sets::readable_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct GetUserByEmailUseCase {
    repo: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetUserByEmailUseCase {
    pub fn new(repo: Arc<dyn UserRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        email: Email,
    ) -> AppResult<UserView> {
        let mut params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        if let Some(id) = self
            .repo
            .find_user_id_by_email(ctx.clone(), email.clone())
            .await?
            && id == *ctx.user_id()
        {
            params = params.with_target_user_id(&id);
        }
        let access = authorize_use_case_with_fields::<Self, UserField>(
            self.auth.as_ref(),
            &params,
            readable_user_fields,
        )?;
        let view = self.repo.fetch_view_by_email(ctx, email, &access).await?;
        Ok(UserProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for GetUserByEmailUseCase {
    const NAME: &'static str = "get_user_by_email";
    const RESOURCE: &'static str = "user";
    const ACTION: &'static str = "read";
}
