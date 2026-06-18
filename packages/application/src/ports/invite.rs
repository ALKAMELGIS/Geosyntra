use domain::Email;

use crate::{
    dto::invite::{AcceptInviteCommand, CreateInviteCommand, RoleInviteView},
    error::AppResult,
};

#[async_trait::async_trait]
pub trait InviteRepository: Send + Sync {
    async fn create(&self, command: CreateInviteCommand) -> AppResult<RoleInviteView>;

    async fn list(&self, limit: u32) -> AppResult<Vec<RoleInviteView>>;

    async fn get_by_token(&self, token: &str) -> AppResult<Option<RoleInviteView>>;

    async fn mark_accepted(&self, token: &str) -> AppResult<RoleInviteView>;

    async fn email_has_pending_invite(&self, email: &Email) -> AppResult<bool>;
}

/// Creates a user from an accepted invite — infra implements directory + membership wiring.
#[async_trait::async_trait]
pub trait InvitedUserCreator: Send + Sync {
    async fn create_from_invite(
        &self,
        command: AcceptInviteCommand,
        invite: RoleInviteView,
    ) -> AppResult<crate::dto::auth::PublicUserView>;
}
