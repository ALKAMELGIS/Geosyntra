use serde::Deserialize;
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError, onboarding::BillingPlanId};

#[derive(Debug, Deserialize)]
struct OkResponse {
    ok: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CheckoutResponse {
    ok: Option<bool>,
    url: Option<String>,
    #[serde(default, alias = "sessionId")]
    session_id: Option<String>,
}

pub async fn start_trial(token: &str, days: u32) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "days": days });
    let _: OkResponse = client
        .post_json("/api/billing/start-trial", &body, Some(token))
        .await?;
    Ok(())
}

pub async fn activate_plan(token: &str, plan: BillingPlanId, payment_completed: bool) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "planId": plan.as_str(),
        "paymentCompleted": payment_completed,
        "provider": if payment_completed { "stripe" } else { "trial" },
    });
    let _: OkResponse = client
        .post_json("/api/billing/activate", &body, Some(token))
        .await?;
    Ok(())
}

pub async fn confirm_payment(token: &str, plan: BillingPlanId) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "planId": plan.as_str(),
        "provider": "stripe",
    });
    let _: OkResponse = client
        .post_json("/api/billing/confirm-payment", &body, Some(token))
        .await?;
    Ok(())
}

pub async fn create_checkout_session(token: &str, plan: BillingPlanId) -> Result<String, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "planId": plan.as_str() });
    let data: CheckoutResponse = client
        .post_json("/api/billing/checkout-session", &body, Some(token))
        .await?;
    data.url.ok_or_else(|| ApiError::Parse {
        message: "checkout response missing url".into(),
    })
}

#[derive(Debug, Clone, Deserialize, PartialEq, Default)]
pub struct BillingSubscription {
    pub plan: Option<String>,
    pub status: Option<String>,
    #[serde(default, alias = "trialEndsAt")]
    pub trial_ends_at: Option<String>,
    #[serde(default, alias = "currentPeriodEnd")]
    pub current_period_end: Option<String>,
    #[serde(default)]
    pub usage: Option<BillingUsage>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Default)]
pub struct BillingUsage {
    #[serde(default, alias = "aiQueries")]
    pub ai_queries: Option<u64>,
    #[serde(default, alias = "groundingCalls")]
    pub grounding_calls: Option<u64>,
    pub exports: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Default)]
pub struct BillingMe {
    pub subscription: BillingSubscription,
}

#[derive(Debug, Deserialize)]
struct BillingMeResponse {
    ok: Option<bool>,
    subscription: Option<BillingSubscription>,
}

pub async fn fetch_billing_me(token: &str) -> Result<BillingMe, ApiError> {
    let client = ApiClient::from_env();
    let data: BillingMeResponse = client.get_json("/api/billing/me", Some(token)).await?;
    Ok(BillingMe {
        subscription: data.subscription.unwrap_or_default(),
    })
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct BillingPlan {
    pub id: String,
}

#[derive(Debug, Deserialize)]
struct BillingPlansResponse {
    plans: Option<Vec<BillingPlan>>,
}

pub async fn fetch_billing_plans() -> Result<Vec<BillingPlan>, ApiError> {
    let client = ApiClient::from_env();
    let data: BillingPlansResponse = client.get_json("/api/billing/plans", None).await?;
    Ok(data.plans.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::BillingPlanId;

    #[test]
    fn billing_plan_ids_match_api() {
        assert_eq!(BillingPlanId::Pro.as_str(), "pro");
    }
}
