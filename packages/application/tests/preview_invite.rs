use std::sync::Arc;

use application::{
    dto::invite::RoleInviteView,
    error::AppResult,
    ports::InviteRepository,
    usecases::invite::preview::PreviewInviteUseCase,
};
use domain::{DateTime, Email};

struct MockInviteRepo {
    invite: RoleInviteView,
}

#[async_trait::async_trait]
impl InviteRepository for MockInviteRepo {
    async fn create(
        &self,
        _command: application::dto::invite::CreateInviteCommand,
    ) -> AppResult<RoleInviteView> {
        unimplemented!()
    }

    async fn list(&self, _limit: u32) -> AppResult<Vec<RoleInviteView>> {
        unimplemented!()
    }

    async fn get_by_token(&self, token: &str) -> AppResult<Option<RoleInviteView>> {
        if token == "valid-token" {
            Ok(Some(self.invite.clone()))
        } else {
            Ok(None)
        }
    }

    async fn mark_accepted(&self, _token: &str) -> AppResult<RoleInviteView> {
        unimplemented!()
    }

    async fn email_has_pending_invite(&self, _email: &Email) -> AppResult<bool> {
        unimplemented!()
    }
}

#[tokio::test]
async fn preview_invite_strips_token_from_response() {
    let future = DateTime::new(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + 3600,
    );
    let repo = Arc::new(MockInviteRepo {
        invite: RoleInviteView {
            token: Some("valid-token".into()),
            email: Some(Email::new("invitee@test.com").unwrap()),
            role_slug: Some("manager".into()),
            expires_at: Some(future),
            ..Default::default()
        },
    });
    let use_case = PreviewInviteUseCase::new(repo);
    let view = use_case.execute("valid-token").await.unwrap();
    assert!(view.token.is_none());
    assert_eq!(view.email.as_ref().unwrap().email(), "invitee@test.com");
}
