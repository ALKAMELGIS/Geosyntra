use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    ports::{AuthLifecycleRepository, PasswordHasher},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct ResetPasswordUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
    hasher: Arc<dyn PasswordHasher>,
}

impl ResetPasswordUseCase {
    pub fn new(
        lifecycle: Arc<dyn AuthLifecycleRepository>,
        hasher: Arc<dyn PasswordHasher>,
    ) -> Self {
        Self { lifecycle, hasher }
    }

    pub async fn execute(&self, token: &str, password: &str) -> AppResult<()> {
        let token = token.trim();
        if token.is_empty() {
            return Err(AppError::ValidationError("token_required".into()));
        }
        if password.len() < 8 {
            return Err(AppError::ValidationError("password_too_short".into()));
        }
        let hash = self.hasher.hash(password)?;
        self.lifecycle.reset_password_by_token(token, &hash).await?;
        Ok(())
    }
}

impl UseCaseDescriptor for ResetPasswordUseCase {
    const NAME: &'static str = "reset_password";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "reset";
    const AUDIT: bool = true;
}
