use std::sync::Arc;

use application::{
    authorization::access_descriptor::AccessControl,
    dto::user::view::{UserProfileView, UserView},
    error::{AppError, AppResult},
    ports::{sort::UserSortBy, UserReadRepository, UserRepository, UserWriteRepository},
    projection::fields::user::UserField,
    SubjectContext,
};
use domain::{
    user::UserStatus, DateTime, Email, Name, User, UserId, Username,
};
use sqlx::PgPool;

use crate::{
    authz::role_slug::{display_role_to_slug, rbac_role_to_display},
    error::map_sqlx,
    postgres::user_id::next_user_id,
};

pub struct PostgresUserRepository {
    pool: Arc<PgPool>,
}

impl PostgresUserRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl UserReadRepository for PostgresUserRepository {
    async fn fetch_view_by_id(
        &self,
        _ctx: SubjectContext,
        id: UserId,
        _access: &AccessControl<UserField>,
    ) -> AppResult<UserView> {
        let row = fetch_row(self.pool.as_ref(), id.as_str())
            .await?
            .ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        Ok(row.into_view())
    }

    async fn fetch_view_by_email(
        &self,
        ctx: SubjectContext,
        email: Email,
        access: &AccessControl<UserField>,
    ) -> AppResult<UserView> {
        let id: Option<String> = sqlx::query_scalar(
            "SELECT id::TEXT FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        let id = id.ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        self.fetch_view_by_id(ctx, UserId::new(&id), access).await
    }

    async fn fetch_view_by_username(
        &self,
        ctx: SubjectContext,
        username: Username,
        access: &AccessControl<UserField>,
    ) -> AppResult<UserView> {
        let id: Option<String> = sqlx::query_scalar(
            "SELECT id::TEXT FROM admin_users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        )
        .bind(username.username())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        let id = id.ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        self.fetch_view_by_id(ctx, UserId::new(&id), access).await
    }

    async fn fetch_views_paginated(
        &self,
        ctx: SubjectContext,
        _access: &AccessControl<UserField>,
        _sort_by: &[UserSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<UserView>> {
        let offset = ((page.saturating_sub(1)) * page_size) as i64;
        let tenant_id = ctx.tenant_id().as_str();
        let rows = sqlx::query_as::<_, UserRow>(
            r#"
            SELECT u.id, u.email, u.name, u.username, u.status, u.role, u.last_login, u.updated_at
            FROM admin_users u
            INNER JOIN memberships m ON m.user_id = u.id::TEXT AND m.tenant_id = $1
            ORDER BY u.id ASC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(tenant_id)
        .bind(page_size as i64)
        .bind(offset)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(UserRow::into_view).collect())
    }

    async fn find_user_id_by_email(
        &self,
        _ctx: SubjectContext,
        email: Email,
    ) -> AppResult<Option<UserId>> {
        let id: Option<String> = sqlx::query_scalar(
            "SELECT id::TEXT FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(id.map(|i| UserId::new(&i)))
    }

    async fn find_user_id_by_username(
        &self,
        _ctx: SubjectContext,
        username: Username,
    ) -> AppResult<Option<UserId>> {
        let id: Option<String> = sqlx::query_scalar(
            "SELECT id::TEXT FROM admin_users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        )
        .bind(username.username())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(id.map(|i| UserId::new(&i)))
    }
}

#[async_trait::async_trait]
impl UserWriteRepository for PostgresUserRepository {
    async fn get_for_update(&self, _ctx: SubjectContext, id: UserId) -> AppResult<User> {
        let row = fetch_row(self.pool.as_ref(), id.as_str())
            .await?
            .ok_or_else(|| AppError::ValidationError("not_found".into()))?;
        row.into_domain()
    }

    async fn insert(
        &self,
        ctx: SubjectContext,
        user: User,
        role_display: Option<String>,
    ) -> AppResult<()> {
        let parts = user.into_parts();
        let id = if parts.id.as_str().is_empty() {
            next_user_id(self.pool.as_ref()).await?
        } else {
            parts.id
        };
        let status = status_to_db(&parts.status);
        let name = parts.profile.first_name().name().to_string();
        let role = role_display
            .filter(|r| !r.trim().is_empty())
            .unwrap_or_else(|| rbac_role_to_display("viewer").to_string());
        let normalized_slug = display_role_to_slug(&role);
        let tenant_id = ctx.tenant_id().as_str();

        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        sqlx::query(
            r#"
            INSERT INTO admin_users (id, email, name, username, status, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            "#,
        )
        .bind(id.as_str().parse::<i64>().map_err(|_| AppError::ValidationError("invalid_id".into()))?)
        .bind(parts.email.email())
        .bind(&name)
        .bind(parts.username.username())
        .bind(status)
        .bind(&role)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        let roles_json = serde_json::json!([format!("{tenant_id}:{normalized_slug}")]);
        sqlx::query(
            r#"
            INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
            VALUES ($1, $2, $3, NOW(), 1)
            ON CONFLICT (user_id, tenant_id) DO UPDATE SET roles = EXCLUDED.roles, version = memberships.version + 1
            "#,
        )
        .bind(id.as_str())
        .bind(tenant_id)
        .bind(roles_json)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        tx.commit().await.map_err(map_sqlx)?;
        Ok(())
    }

    async fn save(&self, _ctx: SubjectContext, user: User) -> AppResult<()> {
        let parts = user.into_parts();
        let status = status_to_db(&parts.status);
        let name = parts.profile.first_name().name().to_string();
        sqlx::query(
            r#"
            UPDATE admin_users
            SET email = $2, username = $3, name = $4, status = $5, updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(parts.id.as_str().parse::<i64>().map_err(|_| AppError::ValidationError("invalid_id".into()))?)
        .bind(parts.email.email())
        .bind(parts.username.username())
        .bind(&name)
        .bind(status)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn delete_by_id(&self, _ctx: SubjectContext, id: UserId) -> AppResult<bool> {
        let result = sqlx::query("DELETE FROM admin_users WHERE id = $1")
            .bind(id.as_str().parse::<i64>().ok())
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn update_directory_role(
        &self,
        _ctx: SubjectContext,
        user_id: UserId,
        role_display: String,
    ) -> AppResult<()> {
        sqlx::query("UPDATE admin_users SET role = $2, updated_at = NOW() WHERE id = $1")
            .bind(user_id.as_str().parse::<i64>().ok())
            .bind(&role_display)
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }
}

impl UserRepository for PostgresUserRepository {}

async fn fetch_row(pool: &PgPool, id: &str) -> AppResult<Option<UserRow>> {
    sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, email, name, username, status, role, last_login, updated_at
        FROM admin_users WHERE id = $1
        "#,
    )
    .bind(id.parse::<i64>().ok())
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: i64,
    email: String,
    name: String,
    username: Option<String>,
    status: String,
    role: String,
    last_login: Option<String>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl UserRow {
    fn into_view(self) -> UserView {
        let email = Email::new(&self.email).ok();
        let username = self
            .username
            .as_ref()
            .and_then(|u| Username::new(u).ok())
            .or_else(|| email.as_ref().and_then(|e| Username::new(e.email()).ok()));
        let role_slug = display_role_to_slug(&self.role).to_string();
        UserView {
            id: Some(UserId::new(&self.id.to_string())),
            email,
            username,
            status: Some(parse_status(&self.status)),
            role: Some(self.role),
            role_slug: Some(role_slug),
            profile: Some(UserProfileView {
                first_name: Name::new(&self.name).ok(),
                updated_at: Some(DateTime::new(self.updated_at.timestamp())),
                ..Default::default()
            }),
            last_login: self
                .last_login
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| DateTime::new(dt.timestamp())),
            version: Some(1),
            ..Default::default()
        }
    }

    fn into_domain(self) -> AppResult<User> {
        let view = self.into_view();
        let id = view.id.ok_or_else(|| AppError::ValidationError("missing_id".into()))?;
        let email = view.email.ok_or_else(|| AppError::ValidationError("missing_email".into()))?;
        let username = view
            .username
            .ok_or_else(|| AppError::ValidationError("missing_username".into()))?;
        let mut builder = User::new(id);
        builder.set_email(email).set_username(username);
        if let Some(first_name) = view
            .profile
            .as_ref()
            .and_then(|p| p.first_name.clone())
        {
            let now = DateTime::new(0);
            let mut profile_builder = domain::user::UserProfile::new();
            profile_builder.set_first_name(first_name.clone());
            profile_builder.set_last_name(first_name);
            profile_builder.set_password(domain::Password::default());
            let profile = profile_builder
                .build(now, now)
                .map_err(AppError::from)?;
            builder.set_profile(profile);
        }
        builder
            .set_status(view.status.unwrap_or(UserStatus::Inactive));
        builder.build().map_err(AppError::from)
    }
}

fn parse_status(raw: &str) -> UserStatus {
    match raw.to_ascii_lowercase().as_str() {
        "active" => UserStatus::Active,
        "suspended" => UserStatus::Suspended,
        "banned" => UserStatus::Banned,
        _ => UserStatus::Inactive,
    }
}

fn status_to_db(status: &UserStatus) -> &'static str {
    match status {
        UserStatus::Active => "Active",
        UserStatus::Suspended => "Suspended",
        UserStatus::Banned => "Banned",
        UserStatus::Inactive => "Inactive",
    }
}
