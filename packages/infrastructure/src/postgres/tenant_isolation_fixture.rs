//! Dev/test fixture: user that belongs only to a secondary tenant (Task 23.5.12).

use application::ports::PasswordHasher;
use serde_json::json;
use sqlx::PgPool;

use crate::{
    crypto::BcryptPasswordHasher,
    error::{map_sqlx, InfraResult},
};

pub const ISOLATED_TENANT_ID: &str = "tenant-isolation-b";
pub const ISOLATED_USER_ID: &str = "900004";
pub const ISOLATED_EMAIL: &str = "isolated@test.local";

/// Idempotent seed for cross-tenant isolation tests in dev and Playwright.
pub async fn ensure_tenant_isolation_fixture(pool: &PgPool) -> InfraResult<()> {
    sqlx::query(
        r#"
        INSERT INTO tenants (id, name)
        VALUES ($1, $2)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(ISOLATED_TENANT_ID)
    .bind("Isolation Tenant B")
    .execute(pool)
    .await
    .map_err(map_sqlx)?;

    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM admin_users WHERE id = $1 LIMIT 1",
    )
    .bind(ISOLATED_USER_ID.parse::<i64>().unwrap_or(900004))
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)?;

    if exists.is_some() {
        return Ok(());
    }

    let hasher = BcryptPasswordHasher::default();
    let password_hash = hasher.hash("TestPass1!")?;

    sqlx::query(
        r#"
        INSERT INTO admin_users (id, email, name, username, role, status, password_hash, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
        "#,
    )
    .bind(ISOLATED_USER_ID.parse::<i64>().unwrap_or(900004))
    .bind(ISOLATED_EMAIL)
    .bind("IsolatedUser")
    .bind("isolated_user")
    .bind("Trial User")
    .bind("Active")
    .bind(&password_hash)
    .execute(pool)
    .await
    .map_err(map_sqlx)?;

    let roles_json = json!([format!("{ISOLATED_TENANT_ID}:trial_user")]);
    sqlx::query(
        r#"
        INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
        VALUES ($1, $2, $3, NOW(), 1)
        ON CONFLICT (user_id, tenant_id) DO NOTHING
        "#,
    )
    .bind(ISOLATED_USER_ID)
    .bind(ISOLATED_TENANT_ID)
    .bind(roles_json)
    .execute(pool)
    .await
    .map_err(map_sqlx)?;

    Ok(())
}
