//! Platform tenant bootstrap — requires Postgres.

use infrastructure::{
    authz::{ensure_platform_tenant, seed_default_tenant_matrix, DEFAULT_TENANT_ID},
    postgres::{connect, run_migrations},
};

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn ensure_platform_tenant_sets_geosyntra_super_tenant() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = connect(&url).await.expect("connect");
    run_migrations(&pool).await.expect("migrate");

    ensure_platform_tenant(&pool).await.expect("ensure platform tenant");
    ensure_platform_tenant(&pool).await.expect("idempotent");
    seed_default_tenant_matrix(&pool).await.expect("seed matrix");

    let row: (String, bool) = sqlx::query_as(
        "SELECT name, is_platform_tenant FROM tenants WHERE id = $1",
    )
    .bind(DEFAULT_TENANT_ID)
    .fetch_one(&pool)
    .await
    .expect("fetch tenant");

    assert_eq!(row.0, "Geosyntra");
    assert!(row.1);

    let platform_perm: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM rbac_permissions WHERE slug LIKE 'platform.%'",
    )
    .fetch_one(&pool)
    .await
    .expect("count platform perms");
    assert_eq!(platform_perm.0, 5);
}
