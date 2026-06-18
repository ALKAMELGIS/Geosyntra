use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use crate::error::{map_migrate, map_sqlx, InfraResult};

pub async fn connect(database_url: &str) -> InfraResult<PgPool> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .map_err(map_sqlx)
}

pub async fn run_migrations(pool: &PgPool) -> InfraResult<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(map_migrate)
}

/// Migrations + platform tenant + default tenant RBAC MATRIX + baseline ABAC (Task 33.1).
pub async fn bootstrap(pool: &PgPool) -> InfraResult<()> {
    run_migrations(pool).await?;
    crate::authz::ensure_platform_tenant(pool).await?;
    crate::authz::seed_default_tenant_matrix(pool).await?;
    crate::authz::seed_default_abac_policy(pool, crate::authz::DEFAULT_TENANT_ID).await?;
    crate::postgres::tenant_isolation_fixture::ensure_tenant_isolation_fixture(pool).await?;
    Ok(())
}
