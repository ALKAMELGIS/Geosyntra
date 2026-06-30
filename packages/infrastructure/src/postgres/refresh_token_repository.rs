use std::sync::Arc;

use application::{
    error::{AppError, AppResult},
    ports::RefreshTokenRepository,
};
use chrono::{Duration, Utc};
use domain::UserId;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::{
    crypto::jwt::verify::verify_token,
    crypto::JwtTokenIssuer,
    error::map_sqlx,
};

pub struct PostgresRefreshTokenRepository {
    pool: Arc<PgPool>,
    jwt: JwtTokenIssuer,
}

impl PostgresRefreshTokenRepository {
    pub fn new(pool: Arc<PgPool>, jwt: JwtTokenIssuer) -> Self {
        Self { pool, jwt }
    }

    fn hash_token(token: &str) -> String {
        let digest = Sha256::digest(token.as_bytes());
        digest.iter().map(|b| format!("{b:02x}")).collect()
    }
}

#[async_trait::async_trait]
impl RefreshTokenRepository for PostgresRefreshTokenRepository {
    async fn persist(
        &self,
        user_id: &UserId,
        refresh_token: &str,
        user_agent: Option<&str>,
    ) -> AppResult<()> {
        let claims = verify_token(self.jwt.secret(), refresh_token)?;
        if claims.typ.as_deref() != Some("refresh") {
            return Err(AppError::ValidationError("invalid_token_type".into()));
        }
        let hash = Self::hash_token(refresh_token);
        let expires = Utc::now() + Duration::days(30);
        let uid = user_id
            .as_str()
            .parse::<i64>()
            .map_err(|_| AppError::ValidationError("invalid_user_id".into()))?;

        sqlx::query(
            r#"
            INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at, user_agent)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(uid)
        .bind(hash)
        .bind(expires)
        .bind(user_agent)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn validate(&self, refresh_token: &str) -> AppResult<UserId> {
        let claims = verify_token(self.jwt.secret(), refresh_token)?;
        if claims.typ.as_deref() != Some("refresh") {
            return Err(AppError::ValidationError("invalid_token_type".into()));
        }
        let hash = Self::hash_token(refresh_token);
        let row: Option<(i64,)> = sqlx::query_as(
            r#"
            SELECT user_id FROM auth_refresh_tokens
            WHERE token_hash = $1
              AND revoked_at IS NULL
              AND expires_at > NOW()
            LIMIT 1
            "#,
        )
        .bind(hash)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let (user_id,) = row.ok_or_else(|| AppError::ValidationError("invalid_token".into()))?;
        Ok(UserId::new(&user_id.to_string()))
    }

    async fn revoke(&self, refresh_token: &str) -> AppResult<()> {
        let hash = Self::hash_token(refresh_token);
        sqlx::query(
            r#"
            UPDATE auth_refresh_tokens SET revoked_at = NOW()
            WHERE token_hash = $1 AND revoked_at IS NULL
            "#,
        )
        .bind(hash)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }
}
