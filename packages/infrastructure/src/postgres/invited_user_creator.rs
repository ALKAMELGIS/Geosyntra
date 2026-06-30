use std::sync::Arc;

use application::{
    dto::{
        auth::PublicUserView,
        invite::{AcceptInviteCommand, RoleInviteView},
    },
    error::{AppError, AppResult},
    ports::{InvitedUserCreator, PasswordHasher},
};
use sqlx::PgPool;

use crate::{
    authz::role_slug::rbac_role_to_display,
    error::map_sqlx,
    postgres::user_id::next_user_id,
};

pub struct PostgresInvitedUserCreator {
    pool: Arc<PgPool>,
    hasher: Arc<dyn PasswordHasher>,
    default_tenant_id: String,
}

impl PostgresInvitedUserCreator {
    pub fn new(pool: Arc<PgPool>, hasher: Arc<dyn PasswordHasher>) -> Self {
        Self {
            pool,
            hasher,
            default_tenant_id: crate::authz::DEFAULT_TENANT_ID.to_string(),
        }
    }

    pub fn with_tenant_id(mut self, tenant_id: impl Into<String>) -> Self {
        self.default_tenant_id = tenant_id.into();
        self
    }
}

#[async_trait::async_trait]
impl InvitedUserCreator for PostgresInvitedUserCreator {
    async fn create_from_invite(
        &self,
        command: AcceptInviteCommand,
        invite: RoleInviteView,
    ) -> AppResult<PublicUserView> {
        let email = invite
            .email
            .clone()
            .ok_or_else(|| AppError::ValidationError("invalid_invite".into()))?;
        let role_slug = invite
            .role_slug
            .clone()
            .unwrap_or_else(|| "viewer".into());
        let role_display = invite
            .role_display
            .clone()
            .unwrap_or_else(|| rbac_role_to_display(&role_slug).to_string());

        let id = next_user_id(self.pool.as_ref()).await?;
        let password_hash = self.hasher.hash(&command.password)?;
        let name = if command.name.trim().is_empty() {
            email.email().to_string()
        } else {
            command.name.trim().to_string()
        };
        let username = email.email().to_string();

        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        sqlx::query(
            r#"
            INSERT INTO admin_users (id, email, name, username, role, status, password_hash, email_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'Active', $6, TRUE, NOW(), NOW())
            "#,
        )
        .bind(id.as_str().parse::<i64>().ok())
        .bind(email.email())
        .bind(&name)
        .bind(&username)
        .bind(&role_display)
        .bind(&password_hash)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        let roles_json = serde_json::json!([format!("{}:{}", self.default_tenant_id, role_slug)]);
        sqlx::query(
            r#"
            INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
            VALUES ($1, $2, $3, NOW(), 1)
            ON CONFLICT (user_id, tenant_id) DO UPDATE SET roles = EXCLUDED.roles, version = memberships.version + 1
            "#,
        )
        .bind(id.as_str())
        .bind(&self.default_tenant_id)
        .bind(roles_json)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        tx.commit().await.map_err(map_sqlx)?;

        Ok(PublicUserView {
            id: Some(id),
            email: Some(email),
            name: Some(name),
            role: Some(role_display),
            role_slug: Some(role_slug),
            status: Some("Active".into()),
            ..Default::default()
        })
    }
}
