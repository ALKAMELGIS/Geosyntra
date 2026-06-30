use std::sync::Arc;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::policy::{ActivatePolicyVersionCommand, PolicyVersionId},
    error::AppResult,
    ports::{PolicyReloadService, PolicyRepository},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ActivatePolicyVersionUseCase {
    repo: Arc<dyn PolicyRepository>,
    auth: Arc<dyn AuthorizationService>,
    reload: Option<Arc<dyn PolicyReloadService>>,
}

impl ActivatePolicyVersionUseCase {
    pub fn new(repo: Arc<dyn PolicyRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self {
            repo,
            auth,
            reload: None,
        }
    }

    pub fn with_policy_reload(mut self, reload: Arc<dyn PolicyReloadService>) -> Self {
        self.reload = Some(reload);
        self
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: domain::tenant::environment::Environment,
        id: PolicyVersionId,
        command: ActivatePolicyVersionCommand,
    ) -> AppResult<()> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        self.repo.activate_version(ctx.clone(), id, command).await?;
        if let Some(reload) = &self.reload {
            reload.invalidate_tenant(&ctx).await?;
        }
        Ok(())
    }
}

impl UseCaseDescriptor for ActivatePolicyVersionUseCase {
    const NAME: &'static str = "activate_policy_version";
    const RESOURCE: &'static str = "policy";
    const ACTION: &'static str = "update";
}
