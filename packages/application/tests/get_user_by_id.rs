use std::sync::Arc;

use application::{
    authorization::{allow_all::AllowAllPolicy, engine::AuthorizationEngine, neutral_environment},
    dto::user::view::UserView,
    error::AppResult,
    ports::UserRepository,
    projection::fields::user::UserField,
    usecases::user::read::get_by::id::GetUserByIdUseCase,
    SubjectContext,
};
use domain::UserId;

struct MockUserRepo {
    view: UserView,
}

#[async_trait::async_trait]
impl application::ports::UserReadRepository for MockUserRepo {
    async fn fetch_view_by_id(
        &self,
        _ctx: SubjectContext,
        _id: UserId,
        _access: &application::authorization::access_descriptor::AccessControl<UserField>,
    ) -> AppResult<UserView> {
        Ok(self.view.clone())
    }

    async fn fetch_view_by_email(
        &self,
        _ctx: SubjectContext,
        _email: domain::Email,
        _access: &application::authorization::access_descriptor::AccessControl<UserField>,
    ) -> AppResult<UserView> {
        unimplemented!()
    }

    async fn fetch_view_by_username(
        &self,
        _ctx: SubjectContext,
        _username: domain::Username,
        _access: &application::authorization::access_descriptor::AccessControl<UserField>,
    ) -> AppResult<UserView> {
        unimplemented!()
    }

    async fn fetch_views_paginated(
        &self,
        _ctx: SubjectContext,
        _access: &application::authorization::access_descriptor::AccessControl<UserField>,
        _sort_by: &[application::ports::sort::UserSortBy],
        _page: u32,
        _page_size: u32,
    ) -> AppResult<Vec<UserView>> {
        unimplemented!()
    }
}

#[async_trait::async_trait]
impl application::ports::UserWriteRepository for MockUserRepo {
    async fn get_for_update(&self, _ctx: SubjectContext, _id: UserId) -> AppResult<domain::User> {
        unimplemented!()
    }
    async fn insert(
        &self,
        _ctx: SubjectContext,
        _user: domain::User,
        _role_display: Option<String>,
    ) -> AppResult<()> {
        unimplemented!()
    }
    async fn save(&self, _ctx: SubjectContext, _user: domain::User) -> AppResult<()> {
        unimplemented!()
    }
    async fn delete_by_id(&self, _ctx: SubjectContext, _id: UserId) -> AppResult<bool> {
        unimplemented!()
    }

    async fn update_directory_role(
        &self,
        _ctx: SubjectContext,
        _user_id: UserId,
        _role_display: String,
    ) -> AppResult<()> {
        Ok(())
    }
}

impl UserRepository for MockUserRepo {}

#[tokio::test]
async fn get_user_by_id_projects_fields_from_subject_permissions() {
    let mut engine = AuthorizationEngine::new();
    engine.register_policy(AllowAllPolicy);

    let repo = Arc::new(MockUserRepo {
        view: UserView {
            id: Some(UserId::new("u1")),
            email: Some(domain::Email::new("user@test.com").unwrap()),
            failed_logins: Some(5),
            version: Some(2),
            ..Default::default()
        },
    });

    let use_case = GetUserByIdUseCase::new(repo, Arc::new(engine));
    let ctx = SubjectContext::new(
        UserId::new("actor"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );

    let result = use_case
        .execute(ctx, neutral_environment(), UserId::new("u1"))
        .await
        .unwrap();

    assert_eq!(result.id.as_ref().unwrap().as_str(), "u1");
    assert!(result.email.is_some());
    // Actor reads u1 without admin permissions — public fields only.
    assert!(result.failed_logins.is_none());
    assert!(result.version.is_none());
}

#[tokio::test]
async fn get_user_by_id_self_read_includes_detail_fields() {
    let mut engine = AuthorizationEngine::new();
    engine.register_policy(AllowAllPolicy);

    let repo = Arc::new(MockUserRepo {
        view: UserView {
            id: Some(UserId::new("u1")),
            email: Some(domain::Email::new("user@test.com").unwrap()),
            version: Some(2),
            ..Default::default()
        },
    });

    let use_case = GetUserByIdUseCase::new(repo, Arc::new(engine));
    let ctx = SubjectContext::new(
        UserId::new("u1"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );

    let result = use_case
        .execute(ctx, neutral_environment(), UserId::new("u1"))
        .await
        .unwrap();

    assert!(result.version.is_some());
    assert!(result.failed_logins.is_none());
}
