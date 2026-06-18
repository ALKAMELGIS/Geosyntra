use std::sync::Arc;

use domain::Email;

use crate::{
    error::{AppError, AppResult},
    ports::{AuthDirectoryRepository, AuthLifecycleRepository},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct ResendVerificationUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
    auth_dir: Arc<dyn AuthDirectoryRepository>,
}

impl ResendVerificationUseCase {
    pub fn new(
        lifecycle: Arc<dyn AuthLifecycleRepository>,
        auth_dir: Arc<dyn AuthDirectoryRepository>,
    ) -> Self {
        Self { lifecycle, auth_dir }
    }

    pub async fn execute(
        &self,
        email: Email,
        token_generator: impl FnOnce() -> (String, String),
    ) -> AppResult<ResendVerificationResult> {
        if let Some(user) = self.auth_dir.find_public_by_email(&email).await? {
            if user.status.as_deref() != Some("Pending Verification") {
                return Err(AppError::ValidationError("already_verified".into()));
            }
            let (token, expires) = token_generator();
            if !self
                .lifecycle
                .set_verification_token(&email, &token, &expires)
                .await?
            {
                return Err(AppError::ValidationError("not_found".into()));
            }
            return Ok(ResendVerificationResult {
                token,
                user_exists: true,
            });
        }
        Ok(ResendVerificationResult {
            token: String::new(),
            user_exists: false,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ResendVerificationResult {
    pub token: String,
    pub user_exists: bool,
}

impl UseCaseDescriptor for ResendVerificationUseCase {
    const NAME: &'static str = "resend_verification";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "resend";
    const AUDIT: bool = true;
}
