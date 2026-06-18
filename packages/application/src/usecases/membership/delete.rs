use std::sync::Arc;

use domain::{tenant::environment::Environment, TenantId, UserId};

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    error::AppResult,
    ports::{AuthCache, MembershipRepository, NoopAuthCache},
    projection::fields::membership::MembershipField,
    usecases::{field_sets::readable_membership_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct DeleteMembershipUseCase {
    repo: Arc<dyn MembershipRepository>,
    auth: Arc<dyn AuthorizationService>,
    auth_cache: Arc<dyn AuthCache>,
}

impl DeleteMembershipUseCase {
    pub fn new(repo: Arc<dyn MembershipRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self {
            repo,
            auth,
            auth_cache: Arc::new(NoopAuthCache),
        }
    }

    pub fn with_auth_cache(mut self, cache: Arc<dyn AuthCache>) -> Self {
        self.auth_cache = cache;
        self
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<bool> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        let _access = authorize_use_case_with_fields::<Self, MembershipField>(
            self.auth.as_ref(),
            &params,
            readable_membership_fields,
        )?;
        let removed = self.repo.delete(ctx.clone(), user_id.clone(), tenant_id.clone()).await?;
        if removed {
            self.auth_cache
                .invalidate_user(user_id.as_str())
                .await;
            self.auth_cache
                .invalidate_tenant(tenant_id.as_str())
                .await;
        }
        Ok(removed)
    }
}

impl UseCaseDescriptor for DeleteMembershipUseCase {
    const NAME: &'static str = "delete_membership";
    const RESOURCE: &'static str = "membership";
    const ACTION: &'static str = "delete";
}
