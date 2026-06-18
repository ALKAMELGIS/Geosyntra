use std::collections::HashSet;
use std::sync::Arc;

use application::{
    authorization::access_descriptor::AccessControl,
    dto::role::view::{PermissionView, RoleView},
    error::{AppError, AppResult},
    ports::{RoleReadRepository, RoleRepository, RoleWriteRepository},
    projection::fields::role::RoleField,
    SubjectContext,
};
use domain::{Name, Role, RoleId, TenantId};
use sqlx::PgPool;

use crate::{
    authz::role_loader::{load_role_by_slug, try_load_role_by_slug},
    error::map_sqlx,
};

pub struct PostgresRoleRepository {
    pool: Arc<PgPool>,
}

impl PostgresRoleRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }

    fn tenant_id(ctx: &SubjectContext) -> AppResult<String> {
        Ok(ctx.tenant_id().as_str().to_string())
    }
}

#[async_trait::async_trait]
impl RoleReadRepository for PostgresRoleRepository {
    async fn fetch_view_by_id(
        &self,
        ctx: SubjectContext,
        id: RoleId,
        access: &AccessControl<RoleField>,
    ) -> AppResult<RoleView> {
        let _ = access;
        let tenant = Self::tenant_id(&ctx)?;
        let slug = id.as_str().rsplit(':').next().unwrap_or(id.as_str());
        let role = load_role_by_slug(self.pool.as_ref(), &tenant, slug).await?;
        Ok(role_to_view(role))
    }

    async fn fetch_view_by_name(
        &self,
        ctx: SubjectContext,
        name: Name,
        _access: &AccessControl<RoleField>,
    ) -> AppResult<RoleView> {
        let tenant = Self::tenant_id(&ctx)?;
        let slug: Option<String> = sqlx::query_scalar(
            "SELECT slug FROM rbac_roles WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
        )
        .bind(&tenant)
        .bind(name.name())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        let slug = slug.ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        let role = load_role_by_slug(self.pool.as_ref(), &tenant, &slug).await?;
        Ok(role_to_view(role))
    }

    async fn fetch_views_paginated(
        &self,
        ctx: SubjectContext,
        _access: &AccessControl<RoleField>,
        _sort_by: &[application::ports::sort::RoleSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<RoleView>> {
        let tenant = Self::tenant_id(&ctx)?;
        let offset = ((page.saturating_sub(1)) * page_size) as i64;
        let slugs: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT slug FROM rbac_roles
            WHERE tenant_id = $1
            ORDER BY rank DESC, slug ASC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&tenant)
        .bind(page_size as i64)
        .bind(offset)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let mut views = Vec::new();
        for slug in slugs {
            if let Ok(role) = load_role_by_slug(self.pool.as_ref(), &tenant, &slug).await {
                views.push(role_to_view(role));
            }
        }
        Ok(views)
    }

    async fn load_role_by_slug(
        &self,
        tenant_id: &TenantId,
        slug: &str,
    ) -> AppResult<Option<Role>> {
        try_load_role_by_slug(self.pool.as_ref(), tenant_id.as_str(), slug).await
    }
}

#[async_trait::async_trait]
impl RoleWriteRepository for PostgresRoleRepository {
    async fn get_for_update(&self, ctx: SubjectContext, id: RoleId) -> AppResult<Role> {
        let tenant = Self::tenant_id(&ctx)?;
        let slug = id.as_str().rsplit(':').next().unwrap_or(id.as_str());
        load_role_by_slug(self.pool.as_ref(), &tenant, slug).await
    }

    async fn insert(&self, ctx: SubjectContext, role: Role) -> AppResult<()> {
        let tenant = Self::tenant_id(&ctx)?;
        let parts = role.into_parts();
        let slug = crate::authz::role_slug::normalize_rbac_role(
            parts.id.as_str().rsplit(':').next().unwrap_or(parts.id.as_str()),
        );
        let role_id = format!("{tenant}:{slug}");
        let name = parts.name.name();
        let rank = crate::authz::role_slug::role_rank(slug);

        sqlx::query(
            r#"
            INSERT INTO rbac_roles (id, tenant_id, slug, name, rank)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank
            "#,
        )
        .bind(&role_id)
        .bind(&tenant)
        .bind(slug)
        .bind(name)
        .bind(rank)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        sync_role_permissions(self.pool.as_ref(), &role_id, &parts.permissions).await
    }

    async fn save(&self, ctx: SubjectContext, role: Role) -> AppResult<()> {
        self.insert(ctx, role).await
    }

    async fn delete_by_id(&self, ctx: SubjectContext, id: RoleId) -> AppResult<bool> {
        let tenant = Self::tenant_id(&ctx)?;
        let db_id = if id.as_str().contains(':') {
            id.as_str().to_string()
        } else {
            format!("{tenant}:{}", id.as_str())
        };
        let result = sqlx::query("DELETE FROM rbac_roles WHERE id = $1 AND tenant_id = $2")
            .bind(&db_id)
            .bind(&tenant)
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}

impl RoleRepository for PostgresRoleRepository {}

async fn sync_role_permissions(
    pool: &PgPool,
    role_id: &str,
    permissions: &HashSet<domain::Permission>,
) -> AppResult<()> {
    sqlx::query("DELETE FROM rbac_role_permissions WHERE role_id = $1")
        .bind(role_id)
        .execute(pool)
        .await
        .map_err(map_sqlx)?;

    for perm in permissions {
        let slug = perm.id().as_str().to_string();
        sqlx::query(
            "INSERT INTO rbac_role_permissions (role_id, permission_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(role_id)
        .bind(&slug)
        .execute(pool)
        .await
        .map_err(map_sqlx)?;
    }
    Ok(())
}

fn role_to_view(role: Role) -> RoleView {
    let parts = role.into_parts();
    let permissions = parts
        .permissions
        .into_iter()
        .map(|p| PermissionView {
            id: Some(p.id().clone()),
            resource: Some(p.resource().clone()),
            action: Some(p.action().clone()),
            description: Some(p.description().clone()),
            created_at: Some(*p.created_at()),
            version: Some(*p.version()),
        })
        .collect();

    RoleView {
        id: Some(parts.id),
        name: Some(parts.name),
        description: Some(parts.description),
        permissions,
        is_system_role: Some(parts.is_system_role),
        created_at: Some(parts.created_at),
        version: Some(parts.version),
    }
}
