use domain::{TemporaryGrant, TenantId, UserId};

use crate::{
    dto::tenant::view::TemporaryGrantView,
    error::AppResult,
    SubjectContext,
};

#[async_trait::async_trait]
pub trait TemporaryGrantRepository: Send + Sync {
    async fn fetch_active_for_user(
        &self,
        user_id: &UserId,
        tenant_id: &TenantId,
    ) -> AppResult<Vec<TemporaryGrant>>;

    async fn fetch_views_by_tenant(
        &self,
        ctx: SubjectContext,
        tenant_id: TenantId,
        limit: u32,
    ) -> AppResult<Vec<TemporaryGrantView>>;

    async fn insert(
        &self,
        ctx: SubjectContext,
        grant_id: &str,
        grant: TemporaryGrant,
        tenant_id: TenantId,
    ) -> AppResult<()>;

    async fn revoke(
        &self,
        ctx: SubjectContext,
        grant_id: &str,
    ) -> AppResult<bool>;
}
