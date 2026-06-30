use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    error::AppResult,
    ports::SubscriptionRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct StartBillingTrialUseCase {
    repo: Arc<dyn SubscriptionRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl StartBillingTrialUseCase {
    pub fn new(repo: Arc<dyn SubscriptionRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        days: u32,
    ) -> AppResult<crate::dto::billing::SubscriptionView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        let days = days.clamp(1, 90);
        self.repo
            .start_trial(ctx.user_id(), "trial", days)
            .await
    }
}

impl UseCaseDescriptor for StartBillingTrialUseCase {
    const NAME: &'static str = "start_billing_trial";
    const RESOURCE: &'static str = "billing";
    const ACTION: &'static str = "update";
}
