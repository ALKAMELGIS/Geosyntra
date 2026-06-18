use std::sync::Arc;

use application::{
    authorization::{engine::AuthorizationEngine, neutral_environment},
    dto::role::view::RoleView,
    error::{AppError, AppResult},
    ports::{sort::RoleSortBy, RoleRepository},
    projection::fields::role::RoleField,
    usecases::role::read::list::ListRoleUseCase,
    SubjectContext,
};

struct MockRoleRepo {
    rows: Vec<RoleView>,
}

#[async_trait::async_trait]
impl application::ports::RoleReadRepository for MockRoleRepo {
    async fn fetch_view_by_id(
        &self,
        _ctx: SubjectContext,
        id: domain::RoleId,
        _access: &application::authorization::access_descriptor::AccessControl<RoleField>,
    ) -> AppResult<RoleView> {
        self.rows
            .iter()
            .find(|r| r.id.as_ref() == Some(&id))
            .cloned()
            .ok_or_else(|| AppError::Repository("not found".into()))
    }

    async fn fetch_view_by_name(
        &self,
        _ctx: SubjectContext,
        _name: domain::Name,
        _access: &application::authorization::access_descriptor::AccessControl<RoleField>,
    ) -> AppResult<RoleView> {
        unimplemented!()
    }

    async fn fetch_views_paginated(
        &self,
        _ctx: SubjectContext,
        _access: &application::authorization::access_descriptor::AccessControl<RoleField>,
        _sort_by: &[RoleSortBy],
        _page: u32,
        _page_size: u32,
    ) -> AppResult<Vec<RoleView>> {
        Ok(self.rows.clone())
    }

    async fn load_role_by_slug(
        &self,
        _tenant_id: &domain::TenantId,
        _slug: &str,
    ) -> AppResult<Option<domain::Role>> {
        Ok(None)
    }
}

#[async_trait::async_trait]
impl application::ports::RoleWriteRepository for MockRoleRepo {
    async fn get_for_update(
        &self,
        _ctx: SubjectContext,
        _id: domain::RoleId,
    ) -> AppResult<domain::Role> {
        unimplemented!()
    }

    async fn insert(&self, _ctx: SubjectContext, _role: domain::Role) -> AppResult<()> {
        unimplemented!()
    }

    async fn save(&self, _ctx: SubjectContext, _role: domain::Role) -> AppResult<()> {
        unimplemented!()
    }

    async fn delete_by_id(&self, _ctx: SubjectContext, _id: domain::RoleId) -> AppResult<bool> {
        unimplemented!()
    }
}

impl RoleRepository for MockRoleRepo {}

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
async fn list_role_returns_non_empty_results() {
    let view = RoleView {
        id: Some(domain::RoleId::new("admin")),
        ..Default::default()
    };
    let use_case = ListRoleUseCase::new(MockRoleRepo {
        rows: vec![view],
    }, Arc::new(AlwaysAllow));
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
async fn list_role_returns_empty_vec_not_error() {
    let use_case = ListRoleUseCase::new(MockRoleRepo { rows: vec![] }, Arc::new(AlwaysAllow));
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
async fn list_role_returns_forbidden_when_auth_denies() {
    let use_case = ListRoleUseCase::new(
        MockRoleRepo { rows: vec![] },
        Arc::new(AuthorizationEngine::with_defaults()),
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
    assert!(matches!(err, AppError::Forbidden));
}
