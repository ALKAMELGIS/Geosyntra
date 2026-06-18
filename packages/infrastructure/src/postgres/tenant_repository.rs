use std::sync::Arc;

use application::{
    dto::tenant::{command::TenantCommand, view::TenantView},
    error::{AppError, AppResult},
    ports::{sort::TenantSortBy, TenantRepository},
    SubjectContext,
};
use domain::{DateTime, Description, Name, TenantId};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::map_sqlx;

pub struct PostgresTenantRepository {
    pool: Arc<PgPool>,
}

impl PostgresTenantRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl TenantRepository for PostgresTenantRepository {
    async fn create(&self, ctx: SubjectContext, tenant: TenantCommand) -> AppResult<TenantView> {
        let id = tenant
            .id
            .clone()
            .ok_or_else(|| AppError::ValidationError("tenant id required".into()))?;
        let name = tenant
            .name
            .clone()
            .unwrap_or_else(|| Name::new("Tenant").expect("valid default tenant name"));
        let mut config = json!({});
        if let Some(desc) = &tenant.description {
            config["description"] = json!(desc.description());
        }

        sqlx::query(
            r#"
            INSERT INTO tenants (id, name, config, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
            "#,
        )
        .bind(id.as_str())
        .bind(name.name())
        .bind(config)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        self.get_by_id(ctx, id).await
    }

    async fn update(&self, ctx: SubjectContext, tenant: TenantCommand) -> AppResult<TenantView> {
        let id = tenant
            .id
            .clone()
            .ok_or_else(|| AppError::ValidationError("tenant id required".into()))?;
        if let Some(name) = &tenant.name {
            sqlx::query("UPDATE tenants SET name = $2, updated_at = NOW() WHERE id = $1")
                .bind(id.as_str())
                .bind(name.name())
                .execute(self.pool.as_ref())
                .await
                .map_err(map_sqlx)?;
        }
        if tenant.description.is_some() {
            self.merge_config(
                ctx.clone(),
                id.clone(),
                tenant.description.as_ref().map(|d| d.description()),
                None,
            )
            .await?;
        }
        self.get_by_id(ctx, id).await
    }

    async fn merge_config(
        &self,
        _ctx: SubjectContext,
        id: TenantId,
        description: Option<&str>,
        patch: Option<&Value>,
    ) -> AppResult<()> {
        let row = sqlx::query_as::<_, ConfigRow>(
            "SELECT config FROM tenants WHERE id = $1",
        )
        .bind(id.as_str())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        .ok_or_else(|| AppError::ValidationError("not_found".into()))?;

        let mut config = row.config;
        if let Some(desc) = description.filter(|s| !s.trim().is_empty()) {
            config["description"] = json!(desc);
        }
        if let Some(patch) = patch {
            merge_json(&mut config, patch);
        }

        sqlx::query("UPDATE tenants SET config = $2, updated_at = NOW() WHERE id = $1")
            .bind(id.as_str())
            .bind(config)
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }

    async fn get_by_id(&self, _ctx: SubjectContext, id: TenantId) -> AppResult<TenantView> {
        let row = fetch_row(self.pool.as_ref(), id.as_str())
            .await?
            .ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        Ok(row.into_view())
    }

    async fn delete(&self, _ctx: SubjectContext, id: TenantId) -> AppResult<bool> {
        let result = sqlx::query("DELETE FROM tenants WHERE id = $1")
            .bind(id.as_str())
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn get_tenants_paginated(
        &self,
        _ctx: SubjectContext,
        _sort_by: &[TenantSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<TenantView>> {
        let offset = ((page.saturating_sub(1)) * page_size) as i64;
        let rows = sqlx::query_as::<_, TenantRow>(
            r#"
            SELECT id, name, is_platform_tenant, config, created_at, updated_at
            FROM tenants
            ORDER BY id ASC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(page_size as i64)
        .bind(offset)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(TenantRow::into_view).collect())
    }
}

fn merge_json(base: &mut Value, patch: &Value) {
    if let (Some(base_obj), Some(patch_obj)) = (base.as_object_mut(), patch.as_object()) {
        for (key, value) in patch_obj {
            base_obj.insert(key.clone(), value.clone());
        }
    }
}

async fn fetch_row(pool: &PgPool, id: &str) -> AppResult<Option<TenantRow>> {
    sqlx::query_as::<_, TenantRow>(
        r#"
        SELECT id, name, is_platform_tenant, config, created_at, updated_at
        FROM tenants WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)
}

#[derive(sqlx::FromRow)]
struct ConfigRow {
    config: Value,
}

#[derive(sqlx::FromRow)]
struct TenantRow {
    id: String,
    name: String,
    is_platform_tenant: bool,
    config: Value,
    created_at: chrono::DateTime<chrono::Utc>,
    #[allow(dead_code)]
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl TenantRow {
    fn into_view(self) -> TenantView {
        let description = self
            .config
            .get("description")
            .and_then(|v| v.as_str())
            .and_then(|s| Description::new(s).ok());
        TenantView {
            id: Some(TenantId::new(&self.id)),
            name: Name::new(&self.name).ok(),
            description,
            created_at: Some(DateTime::new(self.created_at.timestamp())),
            config: None,
            version: None,
            is_platform_tenant: Some(self.is_platform_tenant),
        }
    }
}
