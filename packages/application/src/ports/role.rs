use domain::{Name, Role, RoleId, TenantId};

use crate::{
    authorization::access_descriptor::AccessControl,
    dto::role::view::RoleView,
    error::AppResult,
    ports::sort::RoleSortBy,
    projection::fields::role::RoleField,
    SubjectContext,
};

#[async_trait::async_trait]
pub trait RoleReadRepository: Send + Sync {
    async fn fetch_view_by_id(
        &self,
        ctx: SubjectContext,
        id: RoleId,
        access: &AccessControl<RoleField>,
    ) -> AppResult<RoleView>;

    async fn fetch_view_by_name(
        &self,
        ctx: SubjectContext,
        name: Name,
        access: &AccessControl<RoleField>,
    ) -> AppResult<RoleView>;

    async fn fetch_views_paginated(
        &self,
        ctx: SubjectContext,
        access: &AccessControl<RoleField>,
        sort_by: &[RoleSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<RoleView>>;

    /// JWT / SubjectContext bridge — load role + permissions from persistence.
    async fn load_role_by_slug(
        &self,
        tenant_id: &TenantId,
        slug: &str,
    ) -> AppResult<Option<Role>>;
}

#[async_trait::async_trait]
pub trait RoleWriteRepository: Send + Sync {
    async fn get_for_update(&self, ctx: SubjectContext, id: RoleId) -> AppResult<Role>;
    async fn insert(&self, ctx: SubjectContext, role: Role) -> AppResult<()>;
    async fn save(&self, ctx: SubjectContext, role: Role) -> AppResult<()>;
    async fn delete_by_id(&self, ctx: SubjectContext, id: RoleId) -> AppResult<bool>;
}

#[async_trait::async_trait]
pub trait RoleRepository: RoleReadRepository + RoleWriteRepository {}
