use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::invite::{CreateInviteCommand, RoleInviteView},
    error::{AppError, AppResult},
    ports::{AuthDirectoryRepository, InviteRepository},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct CreateInviteUseCase {
    invites: Arc<dyn InviteRepository>,
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl CreateInviteUseCase {
    pub fn new(
        invites: Arc<dyn InviteRepository>,
        auth_dir: Arc<dyn AuthDirectoryRepository>,
        auth: Arc<dyn AuthorizationService>,
    ) -> Self {
        Self {
            invites,
            auth_dir,
            auth,
        }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        mut command: CreateInviteCommand,
    ) -> AppResult<RoleInviteView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;

        command.invited_by_id = ctx.user_id().as_str().to_string();
        if command.invited_by_email.trim().is_empty() {
            command.invited_by_email = ctx.user_id().as_str().to_string();
        }

        if self
            .auth_dir
            .find_public_by_email(&command.email)
            .await?
            .is_some()
        {
            return Err(AppError::ValidationError("email_exists".into()));
        }

        self.invites.create(command).await
    }
}

impl UseCaseDescriptor for CreateInviteUseCase {
    const NAME: &'static str = "create_invite";
    const RESOURCE: &'static str = "invite";
    const ACTION: &'static str = "create";
}
