use domain::Email;

use crate::{dto::auth::PublicUserView, error::AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsernameHint {
    pub found: bool,
    pub sign_in_id: Option<String>,
    pub username: Option<String>,
    pub oauth_only: bool,
    pub oauth_providers: Vec<String>,
}

#[async_trait::async_trait]
pub trait AuthLifecycleRepository: Send + Sync {
    async fn set_verification_token(
        &self,
        email: &Email,
        token: &str,
        expires_at: &str,
    ) -> AppResult<bool>;

    async fn verify_email_by_token(&self, token: &str) -> AppResult<PublicUserView>;

    async fn set_password_reset_token(
        &self,
        email: &Email,
        token: &str,
        expires_at: &str,
    ) -> AppResult<bool>;

    async fn reset_password_by_token(
        &self,
        token: &str,
        password_hash: &str,
    ) -> AppResult<String>;

    async fn lookup_username_hint(&self, email: &Email) -> AppResult<UsernameHint>;

    async fn user_has_password(&self, email: &Email) -> AppResult<Option<bool>>;
}
