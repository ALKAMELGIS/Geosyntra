use std::sync::Arc;

use application::{
    usecases::{
        ActivateBillingPlanUseCase, GetBillingMeUseCase, ListBillingPlansUseCase,
        StartBillingTrialUseCase,
    },
};

#[derive(Clone)]
pub struct BillingUseCases {
    pub list_plans: Arc<ListBillingPlansUseCase>,
    pub get_me: Arc<GetBillingMeUseCase>,
    pub start_trial: Arc<StartBillingTrialUseCase>,
    pub activate: Arc<ActivateBillingPlanUseCase>,
}
