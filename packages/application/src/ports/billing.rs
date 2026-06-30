use domain::UserId;

use crate::{
    dto::billing::{BillingPlanView, SubscriptionView, UsageView},
    error::AppResult,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivateBillingPlanCommand {
    pub billing_plan_id: String,
    pub payment_completed: bool,
    pub provider: Option<String>,
}

#[async_trait::async_trait]
pub trait SubscriptionRepository: Send + Sync {
    async fn get_for_user(&self, user_id: &UserId) -> AppResult<SubscriptionView>;

    async fn get_usage_for_user(&self, user_id: &UserId) -> AppResult<UsageView>;

    async fn start_trial(
        &self,
        user_id: &UserId,
        billing_plan_id: &str,
        days: u32,
    ) -> AppResult<SubscriptionView>;

    async fn activate_plan(
        &self,
        user_id: &UserId,
        command: ActivateBillingPlanCommand,
    ) -> AppResult<SubscriptionView>;
}

pub trait BillingPlanCatalog: Send + Sync {
    fn list_plans(&self) -> Vec<BillingPlanView>;
}
