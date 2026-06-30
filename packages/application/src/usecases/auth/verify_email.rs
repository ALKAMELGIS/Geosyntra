use std::sync::Arc;

use crate::{
    dto::auth::PublicUserView,
    error::{AppError, AppResult},
    ports::{AuthLifecycleRepository, TokenIssuer},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct VerifyEmailUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
    tokens: Arc<dyn TokenIssuer>,
}

impl VerifyEmailUseCase {
    pub fn new(
        lifecycle: Arc<dyn AuthLifecycleRepository>,
        tokens: Arc<dyn TokenIssuer>,
    ) -> Self {
        Self { lifecycle, tokens }
    }

    pub async fn execute(&self, token: &str) -> AppResult<VerifyEmailResult> {
        let token = token.trim();
        if token.is_empty() {
            return Err(AppError::ValidationError("token_required".into()));
        }
        let user = self.lifecycle.verify_email_by_token(token).await?;
        let access_token = self.tokens.issue_access_token(&user)?;
        let pending_approval = user
            .status
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("Pending Approval"))
            .unwrap_or(false);
        Ok(VerifyEmailResult {
            user,
            access_token,
            pending_approval,
        })
    }
}

#[derive(Debug, Clone)]
pub struct VerifyEmailResult {
    pub user: PublicUserView,
    pub access_token: String,
    pub pending_approval: bool,
}

impl UseCaseDescriptor for VerifyEmailUseCase {
    const NAME: &'static str = "verify_email";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "verify";
    const AUDIT: bool = true;
}
