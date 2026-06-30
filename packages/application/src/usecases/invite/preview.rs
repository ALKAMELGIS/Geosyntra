use std::sync::Arc;

use crate::{
    dto::invite::RoleInviteView,
    error::{AppError, AppResult},
    ports::InviteRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

/// Public preview — no JWT required (Express `GET /api/rbac/invites/preview`).
pub struct PreviewInviteUseCase {
    repo: Arc<dyn InviteRepository>,
}

impl PreviewInviteUseCase {
    pub fn new(repo: Arc<dyn InviteRepository>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, token: &str) -> AppResult<RoleInviteView> {
        let token = token.trim();
        if token.is_empty() {
            return Err(AppError::ValidationError("token_required".into()));
        }
        let invite = self
            .repo
            .get_by_token(token)
            .await?
            .ok_or_else(|| AppError::ValidationError("invalid_invite".into()))?;
        if invite
            .expires_at
            .as_ref()
            .is_some_and(|at| *at.datetime() <= chrono_now())
        {
            return Err(AppError::ValidationError("invite_expired".into()));
        }
        Ok(strip_sensitive(invite))
    }
}

fn strip_sensitive(mut invite: RoleInviteView) -> RoleInviteView {
    invite.token = None;
    invite.invited_by_email = None;
    invite
}

fn chrono_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl UseCaseDescriptor for PreviewInviteUseCase {
    const NAME: &'static str = "preview_invite";
    const RESOURCE: &'static str = "invite";
    const ACTION: &'static str = "preview";
    const AUDIT: bool = false;
}
