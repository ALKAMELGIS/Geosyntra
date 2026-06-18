use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    command_appliers::MembershipCommandApplier,
    dto::tenant::{command::MembershipCommand, view::MembershipView},
    error::{AppError, AppResult},
    ports::MembershipRepository,
    projection::{fields::membership::MembershipField, MembershipProjector},
    usecases::{field_sets::readable_membership_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct CreateMembershipUseCase {
    repo: Arc<dyn MembershipRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl CreateMembershipUseCase {
    pub fn new(repo: Arc<dyn MembershipRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        input: MembershipCommand,
    ) -> AppResult<MembershipView> {
        let tenant_id = input
            .tenant_id
            .clone()
            .ok_or_else(|| AppError::ValidationError("membership tenant_id required".into()))?;
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        let access = authorize_use_case_with_fields::<Self, MembershipField>(
            self.auth.as_ref(),
            &params,
            readable_membership_fields,
        )?;
        let membership = MembershipCommandApplier::from_create(input)?;
        let user_id = membership.user_id().clone();
        let tenant_id = membership.tenant_id().clone();
        self.repo.insert(ctx.clone(), membership).await?;
        let view = self
            .repo
            .fetch_view_by_user_and_tenant(ctx, user_id, tenant_id, &access)
            .await?;
        Ok(MembershipProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for CreateMembershipUseCase {
    const NAME: &'static str = "create_membership";
    const RESOURCE: &'static str = "membership";
    const ACTION: &'static str = "create";
}
