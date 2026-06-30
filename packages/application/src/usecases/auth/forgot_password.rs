use std::sync::Arc;

use domain::Email;

use crate::{
    error::AppResult,
    ports::AuthLifecycleRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct ForgotPasswordUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
}

impl ForgotPasswordUseCase {
    pub fn new(lifecycle: Arc<dyn AuthLifecycleRepository>) -> Self {
        Self { lifecycle }
    }

    pub async fn execute(
        &self,
        email: Email,
        token_generator: impl FnOnce() -> (String, String),
    ) -> AppResult<ForgotPasswordResult> {
        let Some(has_password) = self.lifecycle.user_has_password(&email).await? else {
            return Ok(ForgotPasswordResult {
                user_exists: false,
                oauth_only: false,
                token: String::new(),
            });
        };
        if !has_password {
            return Ok(ForgotPasswordResult {
                user_exists: true,
                oauth_only: true,
                token: String::new(),
            });
        }
        let (token, expires) = token_generator();
        if self
            .lifecycle
            .set_password_reset_token(&email, &token, &expires)
            .await?
        {
            Ok(ForgotPasswordResult {
                user_exists: true,
                oauth_only: false,
                token,
            })
        } else {
            Ok(ForgotPasswordResult {
                user_exists: false,
                oauth_only: false,
                token: String::new(),
            })
        }
    }
}

#[derive(Debug, Clone)]
pub struct ForgotPasswordResult {
    pub user_exists: bool,
    pub oauth_only: bool,
    pub token: String,
}

impl UseCaseDescriptor for ForgotPasswordUseCase {
    const NAME: &'static str = "forgot_password";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "forgot";
    const AUDIT: bool = true;
}
