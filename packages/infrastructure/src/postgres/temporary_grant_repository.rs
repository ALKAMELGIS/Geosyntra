use std::collections::HashSet;
use std::sync::Arc;

use application::{
    dto::tenant::view::TemporaryGrantView,
    error::{AppError, AppResult},
    ports::TemporaryGrantRepository,
    SubjectContext,
};
use chrono::{DateTime as ChronoDateTime, Utc};
use domain::{
    Action, DateTime, Description, Permission, PermissionId, Resource, TemporaryGrant, TenantId,
    UserId,
};
use sqlx::PgPool;

use crate::error::map_sqlx;

pub struct PostgresTemporaryGrantRepository {
    pool: Arc<PgPool>,
}

impl PostgresTemporaryGrantRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl TemporaryGrantRepository for PostgresTemporaryGrantRepository {
    async fn fetch_active_for_user(
        &self,
        user_id: &UserId,
        tenant_id: &TenantId,
    ) -> AppResult<Vec<TemporaryGrant>> {
        let rows = sqlx::query_as::<_, GrantRow>(
            r#"
            SELECT id, user_id, description, resource, action, expires_at, created_at, version
            FROM temporary_grants
            WHERE user_id = $1 AND tenant_id = $2
              AND revoked_at IS NULL AND expires_at > NOW()
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id.as_str())
        .bind(tenant_id.as_str())
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn fetch_views_by_tenant(
        &self,
        _ctx: SubjectContext,
        tenant_id: TenantId,
        limit: u32,
    ) -> AppResult<Vec<TemporaryGrantView>> {
        let rows = sqlx::query_as::<_, GrantRow>(
            r#"
            SELECT id, user_id, description, resource, action, expires_at, created_at, version
            FROM temporary_grants
            WHERE tenant_id = $1 AND revoked_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(tenant_id.as_str())
        .bind(limit as i64)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(rows.into_iter().map(GrantRow::into_view).collect())
    }

    async fn insert(
        &self,
        _ctx: SubjectContext,
        grant_id: &str,
        grant: TemporaryGrant,
        tenant_id: TenantId,
    ) -> AppResult<()> {
        let parts = grant.into_parts();
        let (resource, action) = parts
            .permissions
            .iter()
            .next()
            .map(|p| (p.resource().resource().to_string(), p.action().action().to_string()))
            .ok_or_else(|| AppError::ValidationError("grant permission required".into()))?;

        sqlx::query(
            r#"
            INSERT INTO temporary_grants
              (id, user_id, tenant_id, description, resource, action, expires_at, created_at, version)
            VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), to_timestamp($8), $9)
            "#,
        )
        .bind(grant_id)
        .bind(parts.user_id.as_str())
        .bind(tenant_id.as_str())
        .bind(parts.description.description())
        .bind(resource)
        .bind(action)
        .bind(parts.expires_at.datetime())
        .bind(parts.created_at.datetime())
        .bind(parts.version as i64)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn revoke(&self, _ctx: SubjectContext, grant_id: &str) -> AppResult<bool> {
        let result = sqlx::query(
            r#"
            UPDATE temporary_grants SET revoked_at = NOW(), version = version + 1
            WHERE id = $1 AND revoked_at IS NULL
            "#,
        )
        .bind(grant_id)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}

#[derive(sqlx::FromRow)]
struct GrantRow {
    id: String,
    user_id: String,
    description: String,
    resource: String,
    action: String,
    expires_at: ChronoDateTime<Utc>,
    created_at: ChronoDateTime<Utc>,
    version: i64,
}

impl GrantRow {
    fn into_view(self) -> TemporaryGrantView {
        TemporaryGrantView {
            id: Some(self.id),
            user_id: Some(UserId::new(&self.user_id)),
            description: Description::new(&self.description).ok(),
            resource: Resource::new(&self.resource).ok(),
            action: Action::new(&self.action).ok(),
            expires_at: Some(DateTime::new(self.expires_at.timestamp())),
            created_at: Some(DateTime::new(self.created_at.timestamp())),
            version: Some(self.version as u64),
        }
    }

    fn into_domain(self) -> AppResult<TemporaryGrant> {
        let resource = Resource::new(&self.resource).map_err(AppError::from)?;
        let action = Action::new(&self.action).map_err(AppError::from)?;
        let description = Description::new(&self.description).map_err(AppError::from)?;
        let perm = Permission::new(
            PermissionId::new(&format!("tg:{}", self.id)),
            resource,
            action,
            description.clone(),
            DateTime::new(self.created_at.timestamp()),
            self.version as u64,
        );
        Ok(TemporaryGrant::new(
            UserId::new(&self.user_id),
            description,
            HashSet::from([perm]),
            DateTime::new(self.expires_at.timestamp()),
            DateTime::new(self.created_at.timestamp()),
            self.version as u64,
        ))
    }
}
