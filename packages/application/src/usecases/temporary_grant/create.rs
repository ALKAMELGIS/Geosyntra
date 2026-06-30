use std::collections::HashSet;
use std::sync::Arc;

use chrono::Utc;
use domain::{
    tenant::environment::Environment, DateTime, Description, Permission, PermissionId,
    TemporaryGrant, TenantId,
};
use uuid::Uuid;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::tenant::{command::TemporaryGrantCommand, view::TemporaryGrantView},
    error::{AppError, AppResult},
    ports::TemporaryGrantRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct CreateTemporaryGrantUseCase {
    repo: Arc<dyn TemporaryGrantRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl CreateTemporaryGrantUseCase {
    pub fn new(repo: Arc<dyn TemporaryGrantRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        tenant_id: TenantId,
        input: TemporaryGrantCommand,
    ) -> AppResult<TemporaryGrantView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(&tenant_id);
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;

        let user_id = input
            .user_id
            .ok_or_else(|| AppError::ValidationError("user_id required".into()))?;
        let resource = input
            .resource
            .clone()
            .ok_or_else(|| AppError::ValidationError("resource required".into()))?;
        let action = input
            .action
            .clone()
            .ok_or_else(|| AppError::ValidationError("action required".into()))?;
        let expires_at = input
            .expires_at
            .ok_or_else(|| AppError::ValidationError("expires_at required".into()))?;
        let now = DateTime::new(Utc::now().timestamp());
        if expires_at.datetime() <= now.datetime() {
            return Err(AppError::ValidationError("expires_at must be in the future".into()));
        }

        let description = input
            .description
            .unwrap_or_else(|| Description::new("Temporary grant").expect("description"));
        let description_for_view = description.clone();
        let resource_for_perm = resource.clone();
        let action_for_perm = action.clone();
        let perm_id = PermissionId::new(&format!(
            "tg:{}:{}:{}",
            user_id.as_str(),
            resource_for_perm.resource(),
            action_for_perm.action()
        ));
        let permission = Permission::new(
            perm_id,
            resource_for_perm,
            action_for_perm,
            description.clone(),
            now,
            1,
        );
        let grant = TemporaryGrant::new(
            user_id.clone(),
            description,
            HashSet::from([permission]),
            expires_at,
            now,
            input.version.unwrap_or(1),
        );
        let grant_id = format!("tg-{}", Uuid::new_v4());
        self.repo
            .insert(ctx.clone(), &grant_id, grant, tenant_id.clone())
            .await?;

        Ok(TemporaryGrantView {
            id: Some(grant_id),
            user_id: Some(user_id),
            description: Some(description_for_view),
            resource: Some(resource),
            action: Some(action),
            expires_at: Some(expires_at),
            created_at: Some(now),
            version: Some(1),
        })
    }
}

impl UseCaseDescriptor for CreateTemporaryGrantUseCase {
    const NAME: &'static str = "create_temporary_grant";
    const RESOURCE: &'static str = "temporary_grant";
    const ACTION: &'static str = "create";
}
