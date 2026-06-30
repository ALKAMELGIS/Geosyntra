use std::sync::Arc;

use application::{
    dto::auth::PublicUserView,
    error::{AppError, AppResult},
    ports::{AuthLifecycleRepository, UsernameHint},
};
use domain::Email;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::{
    authz::role_slug::{display_role_to_slug, status_after_email_verify},
    auth::is_token_expired,
    error::map_sqlx,
};

pub struct PostgresAuthLifecycleRepository {
    pool: Arc<PgPool>,
}

impl PostgresAuthLifecycleRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

fn parse_profile_extra(raw: Option<String>) -> Value {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}))
}

fn merge_profile_extra(current: Option<String>, patch: Value) -> String {
    let mut base = parse_profile_extra(current);
    if let (Some(obj), Some(patch_obj)) = (base.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_obj {
            obj.insert(k.clone(), v.clone());
        }
    }
    base.to_string()
}

#[async_trait::async_trait]
impl AuthLifecycleRepository for PostgresAuthLifecycleRepository {
    async fn set_verification_token(
        &self,
        email: &Email,
        token: &str,
        expires_at: &str,
    ) -> AppResult<bool> {
        let result = sqlx::query(
            r#"
            UPDATE admin_users
            SET verification_token = $1, verification_token_expires = $2, updated_at = NOW()
            WHERE LOWER(email) = LOWER($3)
            "#,
        )
        .bind(token)
        .bind(expires_at)
        .bind(email.email())
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn verify_email_by_token(&self, token: &str) -> AppResult<PublicUserView> {
        let row = sqlx::query_as::<_, LifecycleUserRow>(
            r#"
            SELECT id, email, name, role, verification_token_expires
            FROM admin_users
            WHERE verification_token = $1
            LIMIT 1
            "#,
        )
        .bind(token)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        .ok_or_else(|| AppError::ValidationError("invalid_token".into()))?;

        if is_token_expired(row.verification_token_expires.as_deref().unwrap_or("")) {
            return Err(AppError::ValidationError("token_expired".into()));
        }

        let next_status = status_after_email_verify(&row.role);
        sqlx::query(
            r#"
            UPDATE admin_users
            SET email_verified = TRUE,
                status = $1,
                verification_token = NULL,
                verification_token_expires = NULL,
                updated_at = NOW()
            WHERE id = $2
            "#,
        )
        .bind(next_status)
        .bind(row.id)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(PublicUserView {
            id: Some(domain::UserId::new(&row.id.to_string())),
            email: Email::new(&row.email).ok(),
            name: Some(row.name),
            role: Some(row.role.clone()),
            role_slug: Some(display_role_to_slug(&row.role).to_string()),
            status: Some(next_status.into()),
            ..Default::default()
        })
    }

    async fn set_password_reset_token(
        &self,
        email: &Email,
        token: &str,
        expires_at: &str,
    ) -> AppResult<bool> {
        let current: Option<String> = sqlx::query_scalar(
            "SELECT profile_extra FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let patch = json!({
            "passwordResetToken": token,
            "passwordResetExpires": expires_at,
        });
        let merged = merge_profile_extra(current, patch);

        let result = sqlx::query(
            r#"
            UPDATE admin_users
            SET profile_extra = $1, updated_at = NOW()
            WHERE LOWER(email) = LOWER($2)
            "#,
        )
        .bind(&merged)
        .bind(email.email())
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn reset_password_by_token(
        &self,
        token: &str,
        password_hash: &str,
    ) -> AppResult<String> {
        let rows = sqlx::query_as::<_, ProfileExtraRow>(
            r#"
            SELECT id, email, profile_extra
            FROM admin_users
            WHERE profile_extra IS NOT NULL
            "#,
        )
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let matched = rows.into_iter().find(|row| {
            let extra = parse_profile_extra(row.profile_extra.clone());
            extra
                .get("passwordResetToken")
                .and_then(|v| v.as_str())
                == Some(token)
        });

        let row = matched.ok_or_else(|| AppError::ValidationError("invalid_token".into()))?;
        let extra = parse_profile_extra(row.profile_extra.clone());
        let expires = extra
            .get("passwordResetExpires")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if is_token_expired(expires) {
            return Err(AppError::ValidationError("token_expired".into()));
        }

        let mut cleared = extra.as_object().cloned().unwrap_or_default();
        cleared.remove("passwordResetToken");
        cleared.remove("passwordResetExpires");
        let profile_extra = if cleared.is_empty() {
            None
        } else {
            Some(Value::Object(cleared).to_string())
        };

        sqlx::query(
            r#"
            UPDATE admin_users
            SET password_hash = $1, profile_extra = $2, updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(password_hash)
        .bind(profile_extra)
        .bind(row.id)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(row.email)
    }

    async fn lookup_username_hint(&self, email: &Email) -> AppResult<UsernameHint> {
        let row = sqlx::query_as::<_, UsernameRow>(
            r#"
            SELECT email, username, password_hash, profile_extra,
                   oauth_google_sub, oauth_github_sub, oauth_linkedin_sub
            FROM admin_users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            "#,
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let Some(row) = row else {
            return Ok(UsernameHint {
                found: false,
                sign_in_id: None,
                username: None,
                oauth_only: false,
                oauth_providers: vec![],
            });
        };

        let has_password = row
            .password_hash
            .as_deref()
            .map(|h| !h.trim().is_empty())
            .unwrap_or(false);
        let extra = parse_profile_extra(row.profile_extra);
        let mut oauth_providers: Vec<String> = extra
            .get("oauthProviders")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        if oauth_providers.is_empty() {
            if row.oauth_google_sub.as_deref().unwrap_or("").len() > 0 {
                oauth_providers.push("google".into());
            }
            if row.oauth_github_sub.as_deref().unwrap_or("").len() > 0 {
                oauth_providers.push("github".into());
            }
            if row.oauth_linkedin_sub.as_deref().unwrap_or("").len() > 0 {
                oauth_providers.push("linkedin".into());
            }
        }

        let oauth_only = !has_password && !oauth_providers.is_empty();
        let sign_in_id = row.email.clone();
        let username = row
            .username
            .clone()
            .or_else(|| extra.get("username").and_then(|v| v.as_str()).map(str::to_string))
            .unwrap_or_else(|| row.email.clone());

        Ok(UsernameHint {
            found: true,
            sign_in_id: Some(sign_in_id),
            username: Some(username),
            oauth_only,
            oauth_providers,
        })
    }

    async fn user_has_password(&self, email: &Email) -> AppResult<Option<bool>> {
        let row: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT password_hash FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(|(hash,)| hash.as_deref().map(|h| !h.trim().is_empty()).unwrap_or(false)))
    }

    async fn get_profile_extra(&self, email: &Email) -> AppResult<Value> {
        let current = sqlx::query_scalar::<_, Option<String>>(
            "SELECT profile_extra FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        .flatten();
        Ok(parse_profile_extra(current))
    }

    async fn put_profile_extra(&self, email: &Email, patch: Value) -> AppResult<Value> {
        let current = sqlx::query_scalar::<_, Option<String>>(
            "SELECT profile_extra FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        )
        .bind(email.email())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        .flatten();
        let merged = merge_profile_extra(current, patch);
        let result = sqlx::query(
            r#"
            UPDATE admin_users
            SET profile_extra = $1, updated_at = NOW()
            WHERE LOWER(email) = LOWER($2)
            "#,
        )
        .bind(&merged)
        .bind(email.email())
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        if result.rows_affected() == 0 {
            return Err(AppError::ValidationError("not_found".into()));
        }
        Ok(parse_profile_extra(Some(merged)))
    }

    async fn update_password_hash(&self, email: &Email, password_hash: &str) -> AppResult<bool> {
        let result = sqlx::query(
            r#"
            UPDATE admin_users
            SET password_hash = $1, updated_at = NOW()
            WHERE LOWER(email) = LOWER($2)
            "#,
        )
        .bind(password_hash)
        .bind(email.email())
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}

#[derive(sqlx::FromRow)]
struct LifecycleUserRow {
    id: i64,
    email: String,
    name: String,
    role: String,
    verification_token_expires: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ProfileExtraRow {
    id: i64,
    email: String,
    profile_extra: Option<String>,
}

#[derive(sqlx::FromRow)]
struct UsernameRow {
    email: String,
    username: Option<String>,
    password_hash: Option<String>,
    profile_extra: Option<String>,
    oauth_google_sub: Option<String>,
    oauth_github_sub: Option<String>,
    oauth_linkedin_sub: Option<String>,
}
