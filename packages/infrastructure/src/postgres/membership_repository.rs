use std::collections::HashSet;
use std::sync::Arc;

use application::{
    authorization::access_descriptor::AccessControl,
    dto::tenant::view::MembershipView,
    error::{AppError, AppResult},
    ports::{MembershipReadRepository, MembershipRepository, MembershipWriteRepository},
    projection::fields::membership::MembershipField,
    SubjectContext,
};
use domain::{DateTime, Membership, RoleId, TenantId, UserId};
use sqlx::PgPool;

use crate::error::map_sqlx;

pub struct PostgresMembershipRepository {
    pool: Arc<PgPool>,
}

impl PostgresMembershipRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl MembershipReadRepository for PostgresMembershipRepository {
    async fn fetch_view_by_user_and_tenant(
        &self,
        _ctx: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
        _access: &AccessControl<MembershipField>,
    ) -> AppResult<MembershipView> {
        let row = fetch_row(self.pool.as_ref(), user_id.as_str(), tenant_id.as_str())
            .await?
            .ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        Ok(row.into_view())
    }

    async fn fetch_views_by_tenant(
        &self,
        _ctx: SubjectContext,
        tenant_id: TenantId,
        _access: &AccessControl<MembershipField>,
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<MembershipView>> {
        let offset = ((page.saturating_sub(1)) * page_size) as i64;
        let rows = sqlx::query_as::<_, MembershipRow>(
            r#"
            SELECT user_id, tenant_id, roles, created_at, version
            FROM memberships
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(tenant_id.as_str())
        .bind(page_size as i64)
        .bind(offset)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(MembershipRow::into_view).collect())
    }

    async fn find_tenant_for_user(
        &self,
        ctx: SubjectContext,
        user_id: UserId,
    ) -> AppResult<Option<TenantId>> {
        let subject_tenant = ctx.tenant_id().as_str();
        let preferred: Option<String> = sqlx::query_scalar(
            r#"
            SELECT tenant_id FROM memberships
            WHERE user_id = $1 AND tenant_id = $2
            LIMIT 1
            "#,
        )
        .bind(user_id.as_str())
        .bind(subject_tenant)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        if let Some(tenant) = preferred {
            return Ok(Some(TenantId::new(&tenant)));
        }

        Ok(None)
    }
}

#[async_trait::async_trait]
impl MembershipWriteRepository for PostgresMembershipRepository {
    async fn get_for_update(
        &self,
        _ctx: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<Membership> {
        let row = fetch_row(self.pool.as_ref(), user_id.as_str(), tenant_id.as_str())
            .await?
            .ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        row.into_domain()
    }

    async fn insert(&self, _ctx: SubjectContext, membership: Membership) -> AppResult<()> {
        let parts = membership.into_parts();
        let roles = serde_json::to_value(
            parts
                .roles
                .iter()
                .map(|r| r.as_str().to_string())
                .collect::<Vec<_>>(),
        )
        .map_err(|e| AppError::Repository(e.to_string()))?;
        sqlx::query(
            r#"
            INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
            VALUES ($1, $2, $3, to_timestamp($4), $5)
            "#,
        )
        .bind(parts.user_id.as_str())
        .bind(parts.tenant_id.as_str())
        .bind(roles)
        .bind(parts.created_at.datetime())
        .bind(parts.version as i64)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn save(&self, _ctx: SubjectContext, membership: Membership) -> AppResult<()> {
        let parts = membership.into_parts();
        let roles = serde_json::to_value(
            parts
                .roles
                .iter()
                .map(|r| r.as_str().to_string())
                .collect::<Vec<_>>(),
        )
        .map_err(|e| AppError::Repository(e.to_string()))?;
        sqlx::query(
            r#"
            UPDATE memberships SET roles = $3, version = $4
            WHERE user_id = $1 AND tenant_id = $2
            "#,
        )
        .bind(parts.user_id.as_str())
        .bind(parts.tenant_id.as_str())
        .bind(roles)
        .bind(parts.version as i64)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn delete(
        &self,
        _ctx: SubjectContext,
        user_id: UserId,
        tenant_id: TenantId,
    ) -> AppResult<bool> {
        let result = sqlx::query("DELETE FROM memberships WHERE user_id = $1 AND tenant_id = $2")
            .bind(user_id.as_str())
            .bind(tenant_id.as_str())
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}

impl MembershipRepository for PostgresMembershipRepository {}

async fn fetch_row(
    pool: &PgPool,
    user_id: &str,
    tenant_id: &str,
) -> AppResult<Option<MembershipRow>> {
    sqlx::query_as::<_, MembershipRow>(
        r#"
        SELECT user_id, tenant_id, roles, created_at, version
        FROM memberships WHERE user_id = $1 AND tenant_id = $2
        "#,
    )
    .bind(user_id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)
}

#[derive(sqlx::FromRow)]
struct MembershipRow {
    user_id: String,
    tenant_id: String,
    roles: serde_json::Value,
    created_at: chrono::DateTime<chrono::Utc>,
    version: i64,
}

impl MembershipRow {
    fn into_view(self) -> MembershipView {
        MembershipView {
            user_id: Some(UserId::new(&self.user_id)),
            tenant_id: Some(TenantId::new(&self.tenant_id)),
            roles: Some(parse_roles(&self.roles)),
            created_at: Some(DateTime::new(self.created_at.timestamp())),
            version: Some(self.version as u64),
        }
    }

    fn into_domain(self) -> AppResult<Membership> {
        Ok(Membership::new(
            UserId::new(&self.user_id),
            TenantId::new(&self.tenant_id),
            parse_roles(&self.roles),
            DateTime::new(self.created_at.timestamp()),
            self.version as u64,
        ))
    }
}

fn parse_roles(value: &serde_json::Value) -> HashSet<RoleId> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(RoleId::new))
                .collect()
        })
        .unwrap_or_default()
}
