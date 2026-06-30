use std::sync::Arc;

use application::{
    dto::audit::AuditEntryView,
    error::AppResult,
    ports::AuditRepository,
};
use chrono::{DateTime as ChronoDateTime, Utc};
use domain::DateTime;
use sqlx::PgPool;

use crate::error::map_sqlx;

pub struct PostgresAuditRepository {
    pool: Arc<PgPool>,
}

impl PostgresAuditRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl AuditRepository for PostgresAuditRepository {
    async fn list(&self, limit: u32) -> AppResult<Vec<AuditEntryView>> {
        let rows = sqlx::query_as::<_, AuditRow>(
            r#"
            SELECT at, actor, action, target
            FROM admin_audit
            ORDER BY at DESC
            LIMIT $1
            "#,
        )
        .bind(limit as i64)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(rows.into_iter().map(AuditRow::into_view).collect())
    }

    async fn append(
        &self,
        actor: &str,
        action: &str,
        target: Option<&str>,
        details: Option<&str>,
    ) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO admin_audit (actor, action, target, details)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(actor)
        .bind(action)
        .bind(target)
        .bind(details)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct AuditRow {
    at: ChronoDateTime<Utc>,
    actor: Option<String>,
    action: String,
    target: Option<String>,
}

impl AuditRow {
    fn into_view(self) -> AuditEntryView {
        AuditEntryView {
            at: Some(DateTime::new(self.at.timestamp())),
            actor: self.actor,
            action: Some(self.action),
            target: self.target,
        }
    }
}
