use std::sync::Arc;

use domain::{tenant::environment::Environment, TenantId};

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::tenant::view::MembershipView,
    error::AppResult,
    ports::MembershipRepository,
    projection::{fields::membership::MembershipField, MembershipProjector},
    usecases::{field_sets::readable_membership_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct ListMembershipsByTenantUseCase {
    repo: Arc<dyn MembershipRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListMembershipsByTenantUseCase {
    pub fn new(repo: Arc<dyn MembershipRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        tenant_id: TenantId,
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<MembershipView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        let access = authorize_use_case_with_fields::<Self, MembershipField>(
            self.auth.as_ref(),
            &params,
            readable_membership_fields,
        )?;
        let rows = self
            .repo
            .fetch_views_by_tenant(ctx, tenant_id, &access, page, page_size)
            .await?;
        Ok(rows
            .into_iter()
            .map(|view| MembershipProjector::present(view, &access))
            .collect())
    }
}

impl UseCaseDescriptor for ListMembershipsByTenantUseCase {
    const NAME: &'static str = "list_memberships_by_tenant";
    const RESOURCE: &'static str = "membership";
    const ACTION: &'static str = "list";
}
