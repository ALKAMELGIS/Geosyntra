use std::sync::Arc;

use application::{
    authorization::{allow_all::AllowAllPolicy, engine::AuthorizationEngine, neutral_environment},
    dto::user::view::UserView,
    error::AppResult,
    ports::{sort::UserSortBy, UserRepository},
    projection::fields::user::UserField,
    usecases::user::read::list::ListUserUseCase,
    SubjectContext,
};
use domain::UserId;

struct MockUserRepo {
    rows: Vec<UserView>,
}

#[async_trait::async_trait]
impl application::ports::UserReadRepository for MockUserRepo {
    async fn fetch_view_by_id(
        &self,
        _ctx: SubjectContext,
        id: UserId,
        _access: &application::authorization::access_descriptor::AccessControl<UserField>,
    ) -> AppResult<UserView> {
        self.rows
            .iter()
            .find(|r| r.id.as_ref() == Some(&id))
            .cloned()
            .ok_or_else(|| application::error::AppError::Repository("not found".into()))
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
        _sort_by: &[UserSortBy],
        _page: u32,
        _page_size: u32,
    ) -> AppResult<Vec<UserView>> {
        Ok(self.rows.clone())
    }
}

#[async_trait::async_trait]
impl application::ports::UserWriteRepository for MockUserRepo {
    async fn get_for_update(
        &self,
        _ctx: SubjectContext,
        _id: UserId,
    ) -> AppResult<domain::User> {
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

struct AlwaysAllow;

impl application::authorization::ports::AuthorizationService for AlwaysAllow {
    fn authorize(
        &self,
        _ctx: &application::authorization::engine::AuthorizationContext,
    ) -> application::authorization::AccessDecision {
        application::authorization::AccessDecision::Allow
    }
}

#[tokio::test]
async fn list_user_returns_non_empty_results() {
    let view = UserView {
        id: Some(domain::UserId::new("u1")),
        ..Default::default()
    };
    let use_case = ListUserUseCase::new(
        Arc::new(MockUserRepo {
            rows: vec![view],
        }),
        Arc::new(AlwaysAllow),
    );
    let ctx = SubjectContext::new(
        domain::UserId::new("actor"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );
    let result = use_case
        .execute(ctx, neutral_environment(), &[], 1, 10)
        .await
        .unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].id.as_ref().unwrap().as_str(), "u1");
}

#[tokio::test]
async fn list_user_returns_empty_vec_not_error() {
    let use_case = ListUserUseCase::new(Arc::new(MockUserRepo { rows: vec![] }), Arc::new(AlwaysAllow));
    let ctx = SubjectContext::new(
        domain::UserId::new("actor"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );
    let result = use_case
        .execute(ctx, neutral_environment(), &[], 1, 10)
        .await
        .unwrap();
    assert!(result.is_empty());
}

#[tokio::test]
async fn list_user_returns_forbidden_when_auth_denies() {
    let use_case = ListUserUseCase::new(
        Arc::new(MockUserRepo { rows: vec![] }),
        Arc::new(AuthorizationEngine::new()),
    );
    let ctx = SubjectContext::new(
        domain::UserId::new("actor"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );
    let err = use_case
        .execute(ctx, neutral_environment(), &[], 1, 10)
        .await
        .unwrap_err();
    assert!(matches!(err, application::error::AppError::Forbidden));
}

#[tokio::test]
async fn list_user_succeeds_with_allow_all_policy_registered() {
    let mut engine = AuthorizationEngine::new();
    engine.register_policy(AllowAllPolicy);
    let use_case = ListUserUseCase::new(
        Arc::new(MockUserRepo {
            rows: vec![UserView {
                id: Some(domain::UserId::new("u1")),
                ..Default::default()
            }],
        }),
        Arc::new(engine),
    );
    let ctx = SubjectContext::new(
        domain::UserId::new("actor"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );
    let result = use_case
        .execute(ctx, neutral_environment(), &[], 1, 10)
        .await
        .unwrap();
    assert_eq!(result.len(), 1);
}

#[tokio::test]
async fn list_user_succeeds_with_default_engine_and_rbac_permission() {
    use domain::{
        Action, DateTime, Description, Name, Permission, PermissionId, Resource, Role, RoleId,
    };

    fn viewer_role() -> Role {
        let mut builder = Role::new(RoleId::new("viewer"));
        builder
            .set_name(Name::new("Viewer").unwrap())
            .set_description(Description::new("Viewer").unwrap())
            .add_permission(Permission::new(
                PermissionId::new("p1"),
                Resource::new("admin_users").unwrap(),
                Action::new("read").unwrap(),
                Description::new("read users").unwrap(),
                DateTime::new(0),
                1,
            ))
            .set_is_system_role(true)
            .set_created_at(DateTime::new(0));
        builder.build().unwrap()
    }

    let use_case = ListUserUseCase::new(
        Arc::new(MockUserRepo {
            rows: vec![UserView {
                id: Some(domain::UserId::new("u1")),
                ..Default::default()
            }],
        }),
        Arc::new(AuthorizationEngine::with_defaults()),
    );
    let ctx = SubjectContext::new(
        domain::UserId::new("actor"),
        domain::TenantId::new("t1"),
        &[viewer_role()],
        &[],
    );
    let result = use_case
        .execute(ctx, neutral_environment(), &[], 1, 10)
        .await
        .unwrap();
    assert_eq!(result.len(), 1);
}
