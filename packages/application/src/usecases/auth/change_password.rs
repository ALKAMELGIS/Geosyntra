use std::sync::Arc;

use domain::Email;

use crate::{
    error::{AppError, AppResult},
    ports::{AuthDirectoryRepository, AuthLifecycleRepository, PasswordHasher},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct ChangePasswordUseCase {
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    lifecycle: Arc<dyn AuthLifecycleRepository>,
    hasher: Arc<dyn PasswordHasher>,
}

impl ChangePasswordUseCase {
    pub fn new(
        auth_dir: Arc<dyn AuthDirectoryRepository>,
        lifecycle: Arc<dyn AuthLifecycleRepository>,
        hasher: Arc<dyn PasswordHasher>,
    ) -> Self {
        Self {
            auth_dir,
            lifecycle,
            hasher,
        }
    }

    pub async fn execute(
        &self,
        email: &Email,
        current_password: &str,
        new_password: &str,
    ) -> AppResult<()> {
        if current_password.is_empty() {
            return Err(AppError::ValidationError("current_password_required".into()));
        }
        if new_password.len() < 8 {
            return Err(AppError::ValidationError("password_too_short".into()));
        }
        self.auth_dir.authenticate(email, current_password).await?;
        let hash = self.hasher.hash(new_password)?;
        let updated = self.lifecycle.update_password_hash(email, &hash).await?;
        if !updated {
            return Err(AppError::ValidationError("not_found".into()));
        }
        Ok(())
    }
}

impl UseCaseDescriptor for ChangePasswordUseCase {
    const NAME: &'static str = "change_password";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "change_password";
    const AUDIT: bool = true;
}
