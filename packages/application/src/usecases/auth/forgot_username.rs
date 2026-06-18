use std::sync::Arc;

use domain::Email;

use crate::{
    error::AppResult,
    ports::{AuthLifecycleRepository, UsernameHint},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct ForgotUsernameUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
}

impl ForgotUsernameUseCase {
    pub fn new(lifecycle: Arc<dyn AuthLifecycleRepository>) -> Self {
        Self { lifecycle }
    }

    pub async fn execute(&self, email: Email) -> AppResult<UsernameHint> {
        self.lifecycle.lookup_username_hint(&email).await
    }
}

impl UseCaseDescriptor for ForgotUsernameUseCase {
    const NAME: &'static str = "forgot_username";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "lookup";
    const AUDIT: bool = false;
}
