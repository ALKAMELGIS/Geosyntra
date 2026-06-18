use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::audit::AuditEntryView,
    error::AppResult,
    ports::AuditRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ListAuditLogUseCase {
    repo: Arc<dyn AuditRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListAuditLogUseCase {
    pub fn new(repo: Arc<dyn AuditRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        limit: u32,
    ) -> AppResult<Vec<AuditEntryView>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        let capped = limit.clamp(1, 500);
        self.repo.list(capped).await
    }
}

impl UseCaseDescriptor for ListAuditLogUseCase {
    const NAME: &'static str = "list_audit_log";
    const RESOURCE: &'static str = "audit";
    const ACTION: &'static str = "list";
}
