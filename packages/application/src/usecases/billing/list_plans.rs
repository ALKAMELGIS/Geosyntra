use std::sync::Arc;

use crate::{
    dto::billing::BillingPlanView,
    error::AppResult,
    ports::BillingPlanCatalog,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

/// Public plan catalog — mirrors Express `GET /api/billing/plans` (optional auth).
pub struct ListBillingPlansUseCase {
    catalog: Arc<dyn BillingPlanCatalog>,
}

impl ListBillingPlansUseCase {
    pub fn new(catalog: Arc<dyn BillingPlanCatalog>) -> Self {
        Self { catalog }
    }

    pub fn execute(&self) -> AppResult<Vec<BillingPlanView>> {
        Ok(self.catalog.list_plans())
    }
}

impl UseCaseDescriptor for ListBillingPlansUseCase {
    const NAME: &'static str = "list_billing_plans";
    const RESOURCE: &'static str = "billing";
    const ACTION: &'static str = "list";
    const AUDIT: bool = false;
}
