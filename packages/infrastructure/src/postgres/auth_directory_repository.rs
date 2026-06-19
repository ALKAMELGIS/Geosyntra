use std::sync::Arc;

use application::{
    dto::auth::{PublicUserView, RegisterCommand},
    error::{AppError, AppResult},
    ports::{AuthDirectoryRepository, PasswordHasher},
};
use domain::Email;
use sqlx::PgPool;

use crate::{
    authz::role_slug::{display_role_to_slug, rbac_role_to_display},
    crypto::BcryptPasswordHasher,
    error::map_sqlx,
    postgres::user_id::next_user_id,
};

pub struct PostgresAuthDirectoryRepository {
    pool: Arc<PgPool>,
    hasher: Arc<dyn PasswordHasher>,
}

impl PostgresAuthDirectoryRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self {
            pool,
            hasher: Arc::new(BcryptPasswordHasher::default()),
        }
    }

    pub fn with_hasher(pool: Arc<PgPool>, hasher: Arc<dyn PasswordHasher>) -> Self {
        Self { pool, hasher }
    }
}

const OAUTH_PROVIDERS: &[&str] = &["google", "github", "linkedin", "apple"];

#[async_trait::async_trait]
impl AuthDirectoryRepository for PostgresAuthDirectoryRepository {
    async fn authenticate(&self, email: &Email, password: &str) -> AppResult<PublicUserView> {
        let row = sqlx::query_as::<_, AuthUserRow>(
            r#"
            SELECT id, email, name, role, status, password_hash, email_verified
            FROM admin_users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            "#,
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        .ok_or_else(|| AppError::ValidationError("user_not_found".into()))?;

        let hash = row
            .password_hash
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string();
        if hash.is_empty() {
            return Err(AppError::ValidationError("auth_incomplete".into()));
        }
        if !self.hasher.verify(&hash, password) {
            return Err(AppError::ValidationError("invalid_password".into()));
        }

        row.check_can_login()?;
        let user_id = row.id;
        let view = row.into_public_view();

        sqlx::query("UPDATE admin_users SET last_login = NOW(), updated_at = NOW() WHERE id = $1")
            .bind(user_id)
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;

        Ok(view)
    }

    async fn register(&self, command: RegisterCommand) -> AppResult<PublicUserView> {
        if self.find_public_by_email(&command.email).await?.is_some() {
            return Err(AppError::ValidationError("email_exists".into()));
        }

        let id = next_user_id(self.pool.as_ref()).await?;
        let role_slug = command
            .requested_role
            .as_deref()
            .unwrap_or("trial_user");
        let role_display = rbac_role_to_display(role_slug);
        let normalized_slug = display_role_to_slug(role_display);
        let password_hash = self.hasher.hash(&command.password)?;
        let name = if command.name.trim().is_empty() {
            command.email.email().to_string()
        } else {
            command.name.trim().to_string()
        };
        let username = command.email.email().to_string();
        let tenant_id = crate::authz::DEFAULT_TENANT_ID;

        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        sqlx::query(
            r#"
            INSERT INTO admin_users (id, email, name, username, role, status, password_hash, email_verified, verification_token, verification_token_expires, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'Pending Verification', $6, FALSE, $7, $8, NOW(), NOW())
            "#,
        )
        .bind(id.as_str().parse::<i64>().ok())
        .bind(command.email.email())
        .bind(&name)
        .bind(&username)
        .bind(role_display)
        .bind(&password_hash)
        .bind(crate::auth::generate_verification_token())
        .bind(crate::auth::verification_expires_at())
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

        Ok(PublicUserView {
            id: Some(id),
            email: Some(command.email),
            name: Some(name),
            role: Some(role_display.to_string()),
            role_slug: Some(normalized_slug.to_string()),
            status: Some("Pending Verification".into()),
            ..Default::default()
        })
    }

    async fn find_public_by_email(&self, email: &Email) -> AppResult<Option<PublicUserView>> {
        let row = sqlx::query_as::<_, AuthUserRow>(
            r#"
            SELECT id, email, name, role, status, password_hash, email_verified
            FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1
            "#,
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(|r| r.into_public_view()))
    }

    async fn find_public_by_id(
        &self,
        user_id: &domain::UserId,
    ) -> AppResult<Option<PublicUserView>> {
        let row = sqlx::query_as::<_, AuthUserRow>(
            r#"
            SELECT id, email, name, role, status, password_hash, email_verified
            FROM admin_users WHERE id = $1 LIMIT 1
            "#,
        )
        .bind(user_id.as_str().parse::<i64>().ok())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(|r| r.into_public_view()))
    }

    async fn upsert_oauth_user(
        &self,
        email: &Email,
        name: &str,
        provider: &str,
        sub: &str,
    ) -> AppResult<PublicUserView> {
        let provider = provider.trim().to_ascii_lowercase();
        if !OAUTH_PROVIDERS.contains(&provider.as_str()) {
            return Err(AppError::ValidationError("invalid_provider".into()));
        }
        let sub = sub.trim();
        if sub.is_empty() {
            return Err(AppError::ValidationError("oauth_sub_required".into()));
        }
        let display_name = if name.trim().is_empty() {
            email.email().to_string()
        } else {
            name.trim().to_string()
        };

        if let Some(row) = sqlx::query_as::<_, AuthUserRow>(
            r#"
            SELECT id, email, name, role, status, password_hash, email_verified
            FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1
            "#,
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        {
            sqlx::query(
                r#"
                UPDATE admin_users
                SET
                    name = COALESCE(NULLIF($2, ''), name),
                    email_verified = TRUE,
                    status = CASE
                        WHEN status = 'Pending Verification' THEN 'Active'
                        ELSE status
                    END,
                    last_login = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                "#,
            )
            .bind(row.id)
            .bind(&display_name)
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;

            let updated = sqlx::query_as::<_, AuthUserRow>(
                r#"
                SELECT id, email, name, role, status, password_hash, email_verified
                FROM admin_users WHERE id = $1 LIMIT 1
                "#,
            )
            .bind(row.id)
            .fetch_one(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
            updated.check_can_login()?;
            return Ok(updated.into_public_view());
        }

        let id = next_user_id(self.pool.as_ref()).await?;
        let role_display = rbac_role_to_display("trial_user");
        let normalized_slug = display_role_to_slug(role_display);
        let username = email.email().to_string();
        let tenant_id = crate::authz::DEFAULT_TENANT_ID;

        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        sqlx::query(
            r#"
            INSERT INTO admin_users (
                id, email, name, username, role, status, password_hash,
                email_verified, verification_token, verification_token_expires,
                created_at, updated_at, last_login
            )
            VALUES ($1, $2, $3, $4, $5, 'Active', NULL, TRUE, NULL, NULL, NOW(), NOW(), NOW())
            "#,
        )
        .bind(id.as_str().parse::<i64>().ok())
        .bind(email.email())
        .bind(&display_name)
        .bind(&username)
        .bind(role_display)
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

        Ok(PublicUserView {
            id: Some(id),
            email: Some(email.clone()),
            name: Some(display_name),
            role: Some(role_display.to_string()),
            role_slug: Some(normalized_slug.to_string()),
            status: Some("Active".into()),
            ..Default::default()
        })
    }
}

#[derive(sqlx::FromRow)]
struct AuthUserRow {
    id: i64,
    email: String,
    name: String,
    role: String,
    status: String,
    password_hash: Option<String>,
    email_verified: bool,
}

impl AuthUserRow {
    fn into_public_view(self) -> PublicUserView {
        let role_slug = display_role_to_slug(&self.role).to_string();
        PublicUserView {
            id: Some(domain::UserId::new(&self.id.to_string())),
            email: Email::new(&self.email).ok(),
            name: Some(self.name),
            role: Some(self.role),
            role_slug: Some(role_slug),
            status: Some(self.status),
            ..Default::default()
        }
    }

    fn check_can_login(&self) -> AppResult<()> {
        if !self.email_verified {
            return Err(AppError::ValidationError("email_not_verified".into()));
        }
        if self.status.eq_ignore_ascii_case("Suspended") {
            return Err(AppError::ValidationError("account_suspended".into()));
        }
        if self.status.eq_ignore_ascii_case("Pending Verification") {
            return Err(AppError::ValidationError("email_not_verified".into()));
        }
        if self.status.eq_ignore_ascii_case("Pending Approval") {
            return Err(AppError::ValidationError("pending_approval".into()));
        }
        Ok(())
    }
}
