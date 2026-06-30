use std::sync::Arc;

use crate::{
    dto::auth::AuthSessionView,
    error::AppResult,
    ports::{AuthDirectoryRepository, RefreshTokenRepository, TokenIssuer},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct RefreshTokenUseCase {
    refresh: Arc<dyn RefreshTokenRepository>,
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    tokens: Arc<dyn TokenIssuer>,
}

impl RefreshTokenUseCase {
    pub fn new(
        refresh: Arc<dyn RefreshTokenRepository>,
        auth_dir: Arc<dyn AuthDirectoryRepository>,
        tokens: Arc<dyn TokenIssuer>,
    ) -> Self {
        Self {
            refresh,
            auth_dir,
            tokens,
        }
    }

    pub async fn execute(&self, refresh_token: &str) -> AppResult<AuthSessionView> {
        let user_id = self.refresh.validate(refresh_token.trim()).await?;
        let user = self
            .auth_dir
            .find_public_by_id(&user_id)
            .await?
            .ok_or_else(|| crate::error::AppError::ValidationError("user_not_found".into()))?;
        let access_token = self.tokens.issue_access_token(&user)?;
        Ok(AuthSessionView {
            user,
            access_token: Some(access_token),
            refresh_token: None,
        })
    }

    pub async fn revoke(&self, refresh_token: &str) -> AppResult<()> {
        let token = refresh_token.trim();
        if token.is_empty() {
            return Ok(());
        }
        self.refresh.revoke(token).await
    }
}

impl UseCaseDescriptor for RefreshTokenUseCase {
    const NAME: &'static str = "refresh_token";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "refresh";
    const AUDIT: bool = false;
}
