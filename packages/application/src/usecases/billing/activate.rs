use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    error::{AppError, AppResult},
    ports::{ActivateBillingPlanCommand, SubscriptionRepository},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

pub struct ActivateBillingPlanUseCase {
    repo: Arc<dyn SubscriptionRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ActivateBillingPlanUseCase {
    pub fn new(repo: Arc<dyn SubscriptionRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        command: ActivateBillingPlanCommand,
    ) -> AppResult<crate::dto::billing::SubscriptionView> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;

        let plan = command.billing_plan_id.trim().to_ascii_lowercase();
        if plan.is_empty() {
            return Err(AppError::ValidationError("plan_required".into()));
        }

        if plan == "trial" {
            return self.repo.start_trial(ctx.user_id(), "trial", 14).await;
        }

        if plan == "enterprise" && !command.payment_completed {
            return self
                .repo
                .activate_plan(
                    ctx.user_id(),
                    ActivateBillingPlanCommand {
                        billing_plan_id: "enterprise".into(),
                        payment_completed: false,
                        provider: command.provider.or(Some("sales".into())),
                    },
                )
                .await;
        }

        if plan == "pro" && !command.payment_completed {
            let bank_transfer = command
                .provider
                .as_deref()
                .is_some_and(|p| p.eq_ignore_ascii_case("bank_transfer"));
            if !bank_transfer {
                return Err(AppError::ValidationError("payment_required".into()));
            }
        }

        self.repo.activate_plan(ctx.user_id(), command).await
    }
}

impl UseCaseDescriptor for ActivateBillingPlanUseCase {
    const NAME: &'static str = "activate_billing_plan";
    const RESOURCE: &'static str = "billing";
    const ACTION: &'static str = "update";
}
