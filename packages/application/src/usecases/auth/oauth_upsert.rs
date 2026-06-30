use std::sync::Arc;

use crate::{
    dto::auth::{AuthSessionView, UpsertOAuthCommand},
    error::AppResult,
    ports::AuthDirectoryRepository,
    usecases::auth::LoginUseCase,
};

pub struct OAuthUpsertUseCase {
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    login: Arc<LoginUseCase>,
}

impl OAuthUpsertUseCase {
    pub fn new(auth_dir: Arc<dyn AuthDirectoryRepository>, login: Arc<LoginUseCase>) -> Self {
        Self { auth_dir, login }
    }

    pub async fn execute(
        &self,
        command: UpsertOAuthCommand,
        user_agent: Option<&str>,
    ) -> AppResult<AuthSessionView> {
        let user = self
            .auth_dir
            .upsert_oauth_user(
                &command.email,
                &command.name,
                &command.provider,
                &command.sub,
            )
            .await?;
        self.login
            .issue_session_for(user, command.remember, user_agent)
            .await
    }
}
