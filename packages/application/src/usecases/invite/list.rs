use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::invite::RoleInviteView,
    error::AppResult,
    ports::InviteRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ListInvitesUseCase {
    repo: Arc<dyn InviteRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListInvitesUseCase {
    pub fn new(repo: Arc<dyn InviteRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        limit: u32,
    ) -> AppResult<Vec<RoleInviteView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.list(limit.clamp(1, 100)).await
    }
}

impl UseCaseDescriptor for ListInvitesUseCase {
    const NAME: &'static str = "list_invites";
    const RESOURCE: &'static str = "invite";
    const ACTION: &'static str = "list";
}
