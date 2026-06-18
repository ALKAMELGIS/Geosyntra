//! SetUserRoleUseCase invalidates auth cache on success (Task 23.6).

use std::collections::HashSet;
use std::sync::Arc;

use application::{
    authorization::neutral_environment,
    dto::tenant::view::MembershipView,
    error::AppResult,
    ports::{AuthCache, MembershipRepository, UserRepository},
    usecases::membership::SetUserRoleUseCase,
    SubjectContext,
};
use domain::{DateTime, Membership, RoleId, TenantId, UserId};

struct RecordingAuthCache {
    events: Arc<std::sync::Mutex<Vec<String>>>,
}

#[async_trait::async_trait]
impl AuthCache for RecordingAuthCache {
    async fn get_membership_role_ids(
        &self,
        _: &str,
        _: &str,
    ) -> Option<Vec<String>> {
        None
    }
    async fn set_membership_role_ids(&self, _: &str, _: &str, _: &[String], _: std::time::Duration) {}
    async fn get_role_permission_slugs(&self, _: &str) -> Option<Vec<String>> {
        None
    }
    async fn set_role_permission_slugs(&self, _: &str, _: &[String], _: std::time::Duration) {}
    async fn get_tenant_policies(
        &self,
        _: &str,
    ) -> Option<application::ports::CachedTenantPolicies> {
        None
    }
    async fn set_tenant_policies(
        &self,
        _: &str,
        _: &application::ports::CachedTenantPolicies,
        _: std::time::Duration,
    ) {
    }
    async fn invalidate_user(&self, user_id: &str) {
        self.events
            .lock()
            .unwrap()
            .push(format!("user:{user_id}"));
    }
    async fn invalidate_tenant(&self, tenant_id: &str) {
        self.events
            .lock()
            .unwrap()
            .push(format!("tenant:{tenant_id}"));
    }
}

struct MockMembershipRepo;

#[async_trait::async_trait]
impl application::ports::MembershipReadRepository for MockMembershipRepo {
    async fn fetch_view_by_user_and_tenant(
        &self,
        _: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
        _: &application::authorization::access_descriptor::AccessControl<
            application::projection::fields::membership::MembershipField,
        >,
    ) -> AppResult<MembershipView> {
        Ok(MembershipView {
            user_id: Some(user_id),
            tenant_id: Some(tenant_id),
            roles: Some(HashSet::from([RoleId::new("default:viewer")])),
            created_at: Some(DateTime::new(0)),
            version: Some(1),
        })
    }

    async fn fetch_views_by_tenant(
        &self,
        _: SubjectContext,
        _: TenantId,
        _: &application::authorization::access_descriptor::AccessControl<
            application::projection::fields::membership::MembershipField,
        >,
        _: u32,
        _: u32,
    ) -> AppResult<Vec<MembershipView>> {
        Ok(vec![])
    }

    async fn find_tenant_for_user(
        &self,
        _: SubjectContext,
        _: UserId,
    ) -> AppResult<Option<TenantId>> {
        Ok(None)
    }
}

#[async_trait::async_trait]
impl application::ports::MembershipWriteRepository for MockMembershipRepo {
    async fn get_for_update(
        &self,
        _: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<Membership> {
        Ok(Membership::new(
            user_id,
            tenant_id,
            HashSet::from([RoleId::new("default:trial_user")]),
            DateTime::new(0),
            1,
        ))
    }

    async fn insert(&self, _: SubjectContext, _: Membership) -> AppResult<()> {
        Ok(())
    }

    async fn save(&self, _: SubjectContext, _: Membership) -> AppResult<()> {
        Ok(())
    }

    async fn delete(&self, _: SubjectContext, _: UserId, _: TenantId) -> AppResult<bool> {
        Ok(false)
    }
}

impl MembershipRepository for MockMembershipRepo {}

struct MockUserRepo;

#[async_trait::async_trait]
impl application::ports::UserReadRepository for MockUserRepo {
    async fn fetch_view_by_id(
        &self,
        _: SubjectContext,
        _: UserId,
        _: &application::authorization::access_descriptor::AccessControl<
            application::projection::fields::user::UserField,
        >,
    ) -> AppResult<application::dto::user::view::UserView> {
        unimplemented!()
    }
    async fn fetch_view_by_email(
        &self,
        _: SubjectContext,
        _: domain::Email,
        _: &application::authorization::access_descriptor::AccessControl<
            application::projection::fields::user::UserField,
        >,
    ) -> AppResult<application::dto::user::view::UserView> {
        unimplemented!()
    }
    async fn fetch_view_by_username(
        &self,
        _: SubjectContext,
        _: domain::Username,
        _: &application::authorization::access_descriptor::AccessControl<
            application::projection::fields::user::UserField,
        >,
    ) -> AppResult<application::dto::user::view::UserView> {
        unimplemented!()
    }
    async fn fetch_views_paginated(
        &self,
        _: SubjectContext,
        _: &application::authorization::access_descriptor::AccessControl<
            application::projection::fields::user::UserField,
        >,
        _: &[application::ports::sort::UserSortBy],
        _: u32,
        _: u32,
    ) -> AppResult<Vec<application::dto::user::view::UserView>> {
        Ok(vec![])
    }
}

#[async_trait::async_trait]
impl application::ports::UserWriteRepository for MockUserRepo {
    async fn get_for_update(&self, _: SubjectContext, _: UserId) -> AppResult<domain::User> {
        unimplemented!()
    }
    async fn insert(
        &self,
        _: SubjectContext,
        _: domain::User,
        _: Option<String>,
    ) -> AppResult<()> {
        Ok(())
    }
    async fn save(&self, _: SubjectContext, _: domain::User) -> AppResult<()> {
        Ok(())
    }
    async fn delete_by_id(&self, _: SubjectContext, _: UserId) -> AppResult<bool> {
        Ok(false)
    }
    async fn update_directory_role(
        &self,
        _: SubjectContext,
        _: UserId,
        _: String,
    ) -> AppResult<()> {
        Ok(())
    }
}

impl UserRepository for MockUserRepo {}

struct AlwaysAllow;

impl application::authorization::ports::AuthorizationService for AlwaysAllow {
    fn authorize(
        &self,
        _: &application::authorization::engine::AuthorizationContext,
    ) -> application::authorization::AccessDecision {
        application::authorization::AccessDecision::Allow
    }
}

#[tokio::test]
async fn set_user_role_invalidates_user_and_tenant_cache() {
    let events = Arc::new(std::sync::Mutex::new(Vec::new()));
    let cache = Arc::new(RecordingAuthCache {
        events: events.clone(),
    }) as Arc<dyn AuthCache>;

    let use_case = SetUserRoleUseCase::new(
        Arc::new(MockMembershipRepo),
        Arc::new(MockUserRepo),
        Arc::new(AlwaysAllow),
    )
    .with_auth_cache(cache);

    let ctx = SubjectContext::new(
        UserId::new("admin"),
        TenantId::new("default"),
        &[],
        &[],
    );
    use_case
        .execute(
            ctx,
            neutral_environment(),
            UserId::new("target-user"),
            TenantId::new("default"),
            "viewer",
        )
        .await
        .unwrap();

    let log = events.lock().unwrap().clone();
    assert!(log.contains(&"user:target-user".to_string()));
    assert!(log.contains(&"tenant:default".to_string()));
}
