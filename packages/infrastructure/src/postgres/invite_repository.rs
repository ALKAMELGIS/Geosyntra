use std::sync::Arc;

use application::{
    dto::invite::{CreateInviteCommand, RoleInviteView},
    error::{AppError, AppResult},
    ports::InviteRepository,
};
use chrono::{DateTime as ChronoDateTime, Duration, Utc};
use domain::{DateTime, Email};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::map_sqlx;

pub struct PostgresInviteRepository {
    pool: Arc<PgPool>,
}

impl PostgresInviteRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl InviteRepository for PostgresInviteRepository {
    async fn create(&self, command: CreateInviteCommand) -> AppResult<RoleInviteView> {
        let token = Uuid::new_v4().to_string().replace('-', "");
        let now = Utc::now();
        let expires = now + Duration::hours(72);
        let email = command.email.email().to_ascii_lowercase();

        sqlx::query(
            r#"
            UPDATE role_invites SET status = 'revoked'
            WHERE LOWER(email) = $1 AND status = 'pending'
            "#,
        )
        .bind(&email)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        sqlx::query(
            r#"
            INSERT INTO role_invites (token, email, role, invited_by, invited_by_email, status, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
            "#,
        )
        .bind(&token)
        .bind(&email)
        .bind(&command.role_slug)
        .bind(command.invited_by_id.parse::<i64>().ok())
        .bind(&command.invited_by_email)
        .bind(expires)
        .bind(now)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(RoleInviteView {
            token: Some(token),
            email: Some(command.email),
            role_slug: Some(command.role_slug),
            invited_by_email: Some(command.invited_by_email),
            status: Some("pending".into()),
            expires_at: Some(DateTime::new(expires.timestamp())),
            created_at: Some(DateTime::new(now.timestamp())),
            ..Default::default()
        })
    }

    async fn list(&self, limit: u32) -> AppResult<Vec<RoleInviteView>> {
        let rows = sqlx::query_as::<_, InviteRow>(
            r#"
            SELECT token, email, role, invited_by_email, status, expires_at, accepted_at, created_at
            FROM role_invites
            ORDER BY id DESC
            LIMIT $1
            "#,
        )
        .bind(limit as i64)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(rows.into_iter().filter_map(InviteRow::into_view).collect())
    }

    async fn get_by_token(&self, token: &str) -> AppResult<Option<RoleInviteView>> {
        let row = sqlx::query_as::<_, InviteRow>(
            r#"
            SELECT token, email, role, invited_by_email, status, expires_at, accepted_at, created_at
            FROM role_invites
            WHERE token = $1
            LIMIT 1
            "#,
        )
        .bind(token)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(row.and_then(InviteRow::into_view))
    }

    async fn mark_accepted(&self, token: &str) -> AppResult<RoleInviteView> {
        let now = Utc::now();
        let row = sqlx::query_as::<_, InviteRow>(
            r#"
            UPDATE role_invites
            SET status = 'accepted', accepted_at = $2
            WHERE token = $1 AND status = 'pending'
            RETURNING token, email, role, invited_by_email, status, expires_at, accepted_at, created_at
            "#,
        )
        .bind(token)
        .bind(now)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        row.and_then(InviteRow::into_view)
            .ok_or_else(|| AppError::ValidationError("invalid_invite".into()))
    }

    async fn email_has_pending_invite(&self, email: &Email) -> AppResult<bool> {
        let exists: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS(
              SELECT 1 FROM role_invites
              WHERE LOWER(email) = LOWER($1) AND status = 'pending'
            )
            "#,
        )
        .bind(email.email())
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(exists)
    }
}

#[derive(sqlx::FromRow)]
struct InviteRow {
    token: String,
    email: String,
    role: String,
    invited_by_email: Option<String>,
    status: String,
    expires_at: ChronoDateTime<Utc>,
    accepted_at: Option<ChronoDateTime<Utc>>,
    created_at: ChronoDateTime<Utc>,
}

impl InviteRow {
    fn into_view(self) -> Option<RoleInviteView> {
        let email = Email::new(&self.email).ok()?;
        Some(RoleInviteView {
            token: Some(self.token),
            email: Some(email),
            role_slug: Some(self.role.clone()),
            role_display: Some(self.role),
            invited_by_email: self.invited_by_email,
            status: Some(self.status),
            expires_at: Some(DateTime::new(self.expires_at.timestamp())),
            accepted_at: self.accepted_at.map(|t| DateTime::new(t.timestamp())),
            created_at: Some(DateTime::new(self.created_at.timestamp())),
        })
    }
}
