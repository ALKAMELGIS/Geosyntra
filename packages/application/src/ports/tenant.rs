use domain::TenantId;

use crate::{
    dto::tenant::{command::TenantCommand, view::TenantView},
    error::AppResult,
    ports::sort::TenantSortBy,
    SubjectContext,
};

#[async_trait::async_trait]
pub trait TenantRepository: Send + Sync {
    async fn create(&self, ctx: SubjectContext, tenant: TenantCommand) -> AppResult<TenantView>;
    async fn update(&self, ctx: SubjectContext, tenant: TenantCommand) -> AppResult<TenantView>;
    async fn get_by_id(&self, ctx: SubjectContext, id: TenantId) -> AppResult<TenantView>;
    async fn delete(&self, ctx: SubjectContext, id: TenantId) -> AppResult<bool>;
    async fn get_tenants_paginated(
        &self,
        ctx: SubjectContext,
        sort_by: &[TenantSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<TenantView>>;
    async fn merge_config(
        &self,
        ctx: SubjectContext,
        id: TenantId,
        description: Option<&str>,
        patch: Option<&serde_json::Value>,
    ) -> AppResult<()>;
}
