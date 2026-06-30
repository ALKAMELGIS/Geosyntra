use std::sync::Arc;

use domain::{tenant::environment::Environment, TenantId, UserId};

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::tenant::view::MembershipView,
    error::AppResult,
    ports::MembershipRepository,
    projection::{fields::membership::MembershipField, MembershipProjector},
    usecases::{field_sets::readable_membership_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct GetMembershipUseCase {
    repo: Arc<dyn MembershipRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetMembershipUseCase {
    pub fn new(repo: Arc<dyn MembershipRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<MembershipView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        let access = authorize_use_case_with_fields::<Self, MembershipField>(
            self.auth.as_ref(),
            &params,
            readable_membership_fields,
        )?;
        let view = self
            .repo
            .fetch_view_by_user_and_tenant(ctx, user_id, tenant_id, &access)
            .await?;
        Ok(MembershipProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for GetMembershipUseCase {
    const NAME: &'static str = "get_membership";
    const RESOURCE: &'static str = "membership";
    const ACTION: &'static str = "read";
}
