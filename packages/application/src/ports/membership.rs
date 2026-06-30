use domain::{Membership, TenantId, UserId};

use crate::{
    authorization::access_descriptor::AccessControl,
    dto::tenant::view::MembershipView,
    error::AppResult,
    projection::fields::membership::MembershipField,
    SubjectContext,
};

#[async_trait::async_trait]
pub trait MembershipReadRepository: Send + Sync {
    async fn fetch_view_by_user_and_tenant(
        &self,
        ctx: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
        access: &AccessControl<MembershipField>,
    ) -> AppResult<MembershipView>;

    async fn fetch_views_by_tenant(
        &self,
        ctx: SubjectContext,
        tenant_id: TenantId,
        access: &AccessControl<MembershipField>,
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<MembershipView>>;

    /// Resolve tenant for a user — prefers membership in subject tenant, else first row (H2-full).
    async fn find_tenant_for_user(
        &self,
        ctx: SubjectContext,
        user_id: UserId,
    ) -> AppResult<Option<TenantId>>;
}

#[async_trait::async_trait]
pub trait MembershipWriteRepository: Send + Sync {
    async fn get_for_update(
        &self,
        ctx: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<Membership>;

    async fn insert(&self, ctx: SubjectContext, membership: Membership) -> AppResult<()>;

    async fn save(&self, ctx: SubjectContext, membership: Membership) -> AppResult<()>;

    async fn delete(
        &self,
        ctx: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<bool>;
}

#[async_trait::async_trait]
pub trait MembershipRepository: MembershipReadRepository + MembershipWriteRepository {}
