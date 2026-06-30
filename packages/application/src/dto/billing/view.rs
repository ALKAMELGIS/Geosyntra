use domain::BillingPlan;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SubscriptionView {
    pub plan: Option<BillingPlan>,
    pub status: Option<String>,
    pub trial_ends_at: Option<String>,
    pub current_period_end: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UsageView {
    pub ai_queries: u32,
    pub grounding_calls: u32,
    pub exports: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillingPlanView {
    pub id: String,
    pub label: String,
    pub ai_queries_per_day: u32,
}
