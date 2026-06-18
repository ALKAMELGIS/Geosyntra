use std::sync::Arc;

use crate::{
    dto::auth::{AuthSessionView, LoginCommand},
    error::AppResult,
    ports::{AuthDirectoryRepository, RefreshTokenRepository, TokenIssuer},
    rbac::{permissions_for_role, DEFAULT_TENANT_ID},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct LoginUseCase {
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    tokens: Arc<dyn TokenIssuer>,
    refresh: Arc<dyn RefreshTokenRepository>,
}

impl LoginUseCase {
    pub fn new(
        auth_dir: Arc<dyn AuthDirectoryRepository>,
        tokens: Arc<dyn TokenIssuer>,
        refresh: Arc<dyn RefreshTokenRepository>,
    ) -> Self {
        Self {
            auth_dir,
            tokens,
            refresh,
        }
    }

    pub async fn execute(
        &self,
        command: LoginCommand,
        user_agent: Option<&str>,
    ) -> AppResult<AuthSessionView> {
        let user = self
            .auth_dir
            .authenticate(&command.email, &command.password)
            .await?;
        let access_token = self.tokens.issue_access_token(&user)?;
        let mut session = AuthSessionView {
            user,
            access_token: Some(access_token),
            refresh_token: None,
        };
        session.user.tenant_id = Some(DEFAULT_TENANT_ID.to_string());
        session.user.permissions = session
            .user
            .role_slug
            .as_deref()
            .map(permissions_for_role)
            .map(|slugs| slugs.iter().map(|s| (*s).to_string()).collect())
            .unwrap_or_default();
        if command.remember {
            let refresh_token = self.tokens.issue_refresh_token(&session.user)?;
            if let Some(id) = session.user.id.as_ref() {
                self.refresh
                    .persist(id, &refresh_token, user_agent)
                    .await?;
            }
            session.refresh_token = Some(refresh_token);
        }
        Ok(session)
    }
}

impl UseCaseDescriptor for LoginUseCase {
    const NAME: &'static str = "login";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "login";
    const AUDIT: bool = true;
}
