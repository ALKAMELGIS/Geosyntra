use std::sync::Arc;

use application::{
    dto::billing::BillingPlanView,
    ports::BillingPlanCatalog,
    usecases::billing::list_plans::ListBillingPlansUseCase,
};
use domain::BillingPlan;

struct StaticCatalog;

impl BillingPlanCatalog for StaticCatalog {
    fn list_plans(&self) -> Vec<BillingPlanView> {
        vec![BillingPlanView {
            id: "free".into(),
            label: "Free".into(),
            ai_queries_per_day: BillingPlan::Free.default_limits().ai_queries_per_day(),
        }]
    }
}

#[test]
fn list_billing_plans_returns_catalog() {
    let use_case = ListBillingPlansUseCase::new(Arc::new(StaticCatalog));
    let plans = use_case.execute().unwrap();
    assert_eq!(plans.len(), 1);
    assert_eq!(plans[0].id, "free");
}
