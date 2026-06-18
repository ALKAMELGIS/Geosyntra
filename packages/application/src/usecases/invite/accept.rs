use std::sync::Arc;

use crate::{
    dto::{
        auth::AuthSessionView,
        invite::{AcceptInviteCommand, RoleInviteView},
    },
    error::{AppError, AppResult},
    ports::{AuthDirectoryRepository, InvitedUserCreator, InviteRepository, TokenIssuer},
    usecases::usecase_descriptor::UseCaseDescriptor,
};

/// Public accept — creates user from invite token (Express `POST /api/rbac/invites/accept`).
pub struct AcceptInviteUseCase {
    invites: Arc<dyn InviteRepository>,
    auth_dir: Arc<dyn AuthDirectoryRepository>,
    creator: Arc<dyn InvitedUserCreator>,
    tokens: Arc<dyn TokenIssuer>,
}

impl AcceptInviteUseCase {
    pub fn new(
        invites: Arc<dyn InviteRepository>,
        auth_dir: Arc<dyn AuthDirectoryRepository>,
        creator: Arc<dyn InvitedUserCreator>,
        tokens: Arc<dyn TokenIssuer>,
    ) -> Self {
        Self {
            invites,
            auth_dir,
            creator,
            tokens,
        }
    }

    pub async fn execute(&self, command: AcceptInviteCommand) -> AppResult<AuthSessionView> {
        if command.password.len() < 8 {
            return Err(AppError::ValidationError("invalid_payload".into()));
        }
        let token = command.token.trim();
        if token.is_empty() {
            return Err(AppError::ValidationError("invalid_payload".into()));
        }

        let invite = self
            .invites
            .get_by_token(token)
            .await?
            .ok_or_else(|| AppError::ValidationError("invalid_invite".into()))?;

        if invite_expired(&invite) {
            return Err(AppError::ValidationError("invite_expired".into()));
        }

        let email = invite
            .email
            .clone()
            .ok_or_else(|| AppError::ValidationError("invalid_invite".into()))?;

        if self.auth_dir.find_public_by_email(&email).await?.is_some() {
            return Err(AppError::ValidationError("email_exists".into()));
        }

        let _accepted = self.invites.mark_accepted(token).await?;
        let user = self.creator.create_from_invite(command, invite).await?;
        let access_token = self.tokens.issue_access_token(&user)?;

        Ok(AuthSessionView {
            user,
            access_token: Some(access_token),
            refresh_token: None,
        })
    }
}

fn invite_expired(invite: &RoleInviteView) -> bool {
    invite
        .expires_at
        .as_ref()
        .is_some_and(|at| *at.datetime() <= now_secs())
}

fn now_secs() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl UseCaseDescriptor for AcceptInviteUseCase {
    const NAME: &'static str = "accept_invite";
    const RESOURCE: &'static str = "invite";
    const ACTION: &'static str = "accept";
    const AUDIT: bool = true;
}
