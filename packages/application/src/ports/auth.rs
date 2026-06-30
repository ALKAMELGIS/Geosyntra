use domain::{Email, UserId};

use crate::{
    dto::auth::{LoginCommand, PublicUserView, RegisterCommand},
    error::AppResult,
    SubjectContext,
};

/// Builds request-scoped [`SubjectContext`] from a verified JWT (Task 12).
#[async_trait::async_trait]
pub trait SubjectContextResolver: Send + Sync {
    async fn resolve(&self, bearer_token: &str) -> AppResult<SubjectContext>;
}

#[async_trait::async_trait]
pub trait AuthDirectoryRepository: Send + Sync {
    async fn authenticate(&self, email: &Email, password: &str) -> AppResult<PublicUserView>;

    async fn register(&self, command: RegisterCommand) -> AppResult<PublicUserView>;

    async fn find_public_by_email(&self, email: &Email) -> AppResult<Option<PublicUserView>>;

    async fn find_public_by_id(&self, user_id: &UserId) -> AppResult<Option<PublicUserView>>;

    /// Find or create an OAuth-linked account (Google, GitHub, LinkedIn).
    async fn upsert_oauth_user(
        &self,
        email: &Email,
        name: &str,
        provider: &str,
        sub: &str,
    ) -> AppResult<PublicUserView>;
}

#[async_trait::async_trait]
pub trait PasswordHasher: Send + Sync {
    fn verify(&self, hash: &str, password: &str) -> bool;

    fn hash(&self, password: &str) -> AppResult<String>;
}

#[async_trait::async_trait]
pub trait TokenIssuer: Send + Sync {
    fn issue_access_token(&self, user: &PublicUserView) -> AppResult<String>;

    fn issue_refresh_token(&self, user: &PublicUserView) -> AppResult<String>;
}

#[async_trait::async_trait]
pub trait RefreshTokenRepository: Send + Sync {
    async fn persist(
        &self,
        user_id: &UserId,
        refresh_token: &str,
        user_agent: Option<&str>,
    ) -> AppResult<()>;

    async fn validate(&self, refresh_token: &str) -> AppResult<UserId>;

    async fn revoke(&self, refresh_token: &str) -> AppResult<()>;
}

/// Combined login/register port used by auth use cases (Task 9 sqlx impl).
#[async_trait::async_trait]
pub trait AuthRepository:
    AuthDirectoryRepository + PasswordHasher + TokenIssuer + RefreshTokenRepository
{
}

/// Type alias for login input re-export.
pub type AuthLoginCommand = LoginCommand;
