use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::billing::{SubscriptionView, UsageView},
    error::AppResult,
    ports::SubscriptionRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillingMeView {
    pub subscription: SubscriptionView,
    pub usage: UsageView,
}

pub struct GetBillingMeUseCase {
    repo: Arc<dyn SubscriptionRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl GetBillingMeUseCase {
    pub fn new(
        repo: Arc<dyn SubscriptionRepository>,
        auth: Arc<dyn AuthorizationService>,
    ) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
    ) -> AppResult<BillingMeView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        let user_id = ctx.user_id();
        let subscription = self.repo.get_for_user(user_id).await?;
        let usage = self.repo.get_usage_for_user(user_id).await?;
        Ok(BillingMeView {
            subscription,
            usage,
        })
    }
}

impl UseCaseDescriptor for GetBillingMeUseCase {
    const NAME: &'static str = "get_billing_me";
    const RESOURCE: &'static str = "billing";
    const ACTION: &'static str = "read";
}
