//! Test database reset + dummy users for HTTP integration tests.

use std::sync::Arc;

use infrastructure::{
    crypto::BcryptPasswordHasher,
    postgres::{bootstrap, connect},
    DEFAULT_TENANT_ID,
};
use application::ports::PasswordHasher;
use serde_json::json;
use sqlx::PgPool;

pub const OWNER_EMAIL: &str = "owner@test.local";
pub const MEMBER_EMAIL: &str = "member@test.local";
pub const PENDING_EMAIL: &str = "pending@test.local";
pub const TEST_PASSWORD: &str = "TestPass1!";

pub const OWNER_ID: &str = "900001";
pub const MEMBER_ID: &str = "900002";
pub const PENDING_ID: &str = "900003";
pub const ISOLATED_TENANT_ID: &str = "tenant-isolation-b";
pub const ISOLATED_USER_ID: &str = "900004";
pub const ISOLATED_EMAIL: &str = "isolated@test.local";

/// Migrate, seed RBAC matrix, and insert dummy users for integration tests.
pub async fn prepare_integration_database(
    database_url: &str,
) -> Result<Arc<PgPool>, Box<dyn std::error::Error + Send + Sync>> {
    let pool = Arc::new(connect(database_url).await?);
    bootstrap(pool.as_ref()).await?;
    reset_and_seed(pool.as_ref()).await?;
    Ok(pool)
}

/// Re-seed dummy users between parallel integration suites (shared Postgres).
pub async fn reset_integration_fixtures(
    pool: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    reset_and_seed(pool).await
}

async fn reset_and_seed(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    sqlx::query("DELETE FROM auth_refresh_tokens")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM usage_daily").execute(pool).await?;
    sqlx::query("DELETE FROM user_subscriptions")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM billing_invoices")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM role_invites").execute(pool).await?;
    sqlx::query("DELETE FROM governance_approvals")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM governance_proposals")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM admin_login_history")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM memberships").execute(pool).await?;
    sqlx::query("DELETE FROM admin_users").execute(pool).await?;

    let hasher = BcryptPasswordHasher::new(4);
    let password_hash = hasher.hash(TEST_PASSWORD)?;

    for (id, email, name, username, role, status, role_slug) in [
        (
            OWNER_ID,
            OWNER_EMAIL,
            "OwnerTest",
            "owner_test",
            "Owner",
            "Active",
            "owner",
        ),
        (
            MEMBER_ID,
            MEMBER_EMAIL,
            "MemberTest",
            "member_test",
            "Trial User",
            "Active",
            "trial_user",
        ),
        (
            PENDING_ID,
            PENDING_EMAIL,
            "PendingTest",
            "pending_test",
            "Trial User",
            "Pending Approval",
            "trial_user",
        ),
    ] {
        sqlx::query(
            r#"
            INSERT INTO admin_users (id, email, name, username, role, status, password_hash, email_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            "#,
        )
        .bind(id.parse::<i64>()?)
        .bind(email)
        .bind(name)
        .bind(username)
        .bind(role)
        .bind(status)
        .bind(&password_hash)
        .bind(status == "Active" || status == "Pending Approval")
        .execute(pool)
        .await?;

        let roles_json = json!([format!("{DEFAULT_TENANT_ID}:{role_slug}")]);
        sqlx::query(
            r#"
            INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
            VALUES ($1, $2, $3, NOW(), 1)
            "#,
        )
        .bind(id)
        .bind(DEFAULT_TENANT_ID)
        .bind(roles_json)
        .execute(pool)
        .await?;
    }

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
    .await?;

    let id = ISOLATED_USER_ID;
    let email = ISOLATED_EMAIL;
    sqlx::query(
        r#"
        INSERT INTO admin_users (id, email, name, username, role, status, password_hash, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        "#,
    )
    .bind(id.parse::<i64>()?)
    .bind(email)
    .bind("IsolatedUser")
    .bind("isolated_user")
    .bind("Trial User")
    .bind("Active")
    .bind(&password_hash)
    .bind(true)
    .execute(pool)
    .await?;

    let roles_json = json!([format!("{ISOLATED_TENANT_ID}:trial_user")]);
    sqlx::query(
        r#"
        INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
        VALUES ($1, $2, $3, NOW(), 1)
        "#,
    )
    .bind(id)
    .bind(ISOLATED_TENANT_ID)
    .bind(roles_json)
    .execute(pool)
    .await?;

    Ok(())
}
