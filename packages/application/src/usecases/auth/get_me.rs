use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    dto::auth::PublicUserView,
    error::AppResult,
    ports::AuthDirectoryRepository,
    projection::{fields::auth::PublicUserField, PublicUserProjector},
    rbac::resolve_permission_slugs,
    usecases::{field_sets::readable_public_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

/// Authenticated self profile — mirrors Express `GET /api/auth/me` with projected fields.
pub struct GetAuthMeUseCase {
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetAuthMeUseCase {
    pub fn new(
        auth_dir: Arc<dyn AuthDirectoryRepository>,
        auth: Arc<dyn AuthorizationService>,
    ) -> Self {
        Self { auth_dir, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
    ) -> AppResult<PublicUserView> {
        let user_id = ctx.user_id().clone();
        let params = AuthorizationParams::new(&ctx, environment.clone())
            .with_resource_tenant_id(ctx.tenant_id())
            .with_target_user_id(&user_id);
        let access = authorize_use_case_with_fields::<Self, PublicUserField>(
            self.auth.as_ref(),
            &params,
            readable_public_user_fields,
        )?;
        let view = self
            .auth_dir
            .find_public_by_id(&user_id)
            .await?
            .ok_or_else(|| crate::error::AppError::ValidationError("user_not_found".into()))?;
        let mut presented = PublicUserProjector::present(view, &access);
        presented.tenant_id = Some(ctx.tenant_id().as_str().to_string());
        presented.permissions = resolve_permission_slugs(
            &ctx,
            presented.role_slug.as_deref(),
        );
        Ok(presented)
    }
}

impl UseCaseDescriptor for GetAuthMeUseCase {
    const NAME: &'static str = "get_auth_me";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "read";
    const AUDIT: bool = false;
}
