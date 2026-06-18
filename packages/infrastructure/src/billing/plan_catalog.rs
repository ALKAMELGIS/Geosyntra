use application::{
    dto::billing::BillingPlanView,
    ports::BillingPlanCatalog,
};

/// Static Express plan catalog — mirrors [`planDefinitions.js`](Geosyntra/backend/server/billing/planDefinitions.js).
pub struct ExpressBillingPlanCatalog;

impl BillingPlanCatalog for ExpressBillingPlanCatalog {
    fn list_plans(&self) -> Vec<BillingPlanView> {
        vec![
            BillingPlanView {
                id: "free".into(),
                label: "Free".into(),
                ai_queries_per_day: 10,
            },
            BillingPlanView {
                id: "pro".into(),
                label: "Pro".into(),
                ai_queries_per_day: 500,
            },
            BillingPlanView {
                id: "enterprise".into(),
                label: "Enterprise".into(),
                ai_queries_per_day: 10_000,
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_three_express_plans() {
        let catalog = ExpressBillingPlanCatalog;
        let plans = catalog.list_plans();
        assert_eq!(plans.len(), 3);
        assert!(plans.iter().any(|p| p.id == "free"));
    }
}
