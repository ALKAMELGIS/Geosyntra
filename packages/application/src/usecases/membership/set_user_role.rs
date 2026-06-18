use std::sync::Arc;

use domain::{tenant::environment::Environment, RoleId, TenantId, UserId};

use crate::{
    authorization::{authorize_use_case_with_fields, AuthorizationParams, ports::AuthorizationService},
    command_appliers::MembershipCommandApplier,
    dto::tenant::view::MembershipView,
    error::AppResult,
    ports::{AuthCache, MembershipRepository, NoopAuthCache, UserRepository},
    projection::{fields::membership::MembershipField, MembershipProjector},
    rbac::{normalize_rbac_role, rbac_role_to_display},
    usecases::{field_sets::readable_membership_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct SetUserRoleUseCase {
    membership: Arc<dyn MembershipRepository>,
    users: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
    auth_cache: Arc<dyn AuthCache>,
}

impl SetUserRoleUseCase {
    pub fn new(
        membership: Arc<dyn MembershipRepository>,
        users: Arc<dyn UserRepository>,
        auth: Arc<dyn AuthorizationService>,
    ) -> Self {
        Self {
            membership,
            users,
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
        role_slug: &str,
    ) -> AppResult<MembershipView> {
        self.execute_roles(ctx, environment, user_id, tenant_id, &[role_slug.to_string()])
            .await
    }

    pub async fn execute_roles(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        user_id: UserId,
        tenant_id: TenantId,
        role_slugs: &[String],
    ) -> AppResult<MembershipView> {
        if role_slugs.is_empty() {
            return Err(crate::error::AppError::ValidationError(
                "at least one role required".into(),
            ));
        }
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        let access = authorize_use_case_with_fields::<Self, MembershipField>(
            self.auth.as_ref(),
            &params,
            readable_membership_fields,
        )?;
        let roles: std::collections::HashSet<RoleId> = role_slugs
            .iter()
            .map(|slug| {
                let normalized = normalize_rbac_role(slug);
                RoleId::new(&format!("{}:{normalized}", tenant_id.as_str()))
            })
            .collect();
        let membership = self
            .membership
            .get_for_update(ctx.clone(), user_id.clone(), tenant_id.clone())
            .await?;
        let updated = MembershipCommandApplier::apply_set_roles(membership, roles)?;
        self.membership.save(ctx.clone(), updated).await?;
        self.auth_cache
            .invalidate_user(user_id.as_str())
            .await;
        self.auth_cache
            .invalidate_tenant(tenant_id.as_str())
            .await;
        let primary = normalize_rbac_role(&role_slugs[0]);
        let display = rbac_role_to_display(primary).to_string();
        self.users
            .update_directory_role(ctx.clone(), user_id.clone(), display)
            .await?;
        let view = self
            .membership
            .fetch_view_by_user_and_tenant(ctx, user_id, tenant_id, &access)
            .await?;
        Ok(MembershipProjector::present(view, &access))
    }
}

impl UseCaseDescriptor for SetUserRoleUseCase {
    const NAME: &'static str = "set_user_role";
    const RESOURCE: &'static str = "membership";
    const ACTION: &'static str = "set_role";
}
