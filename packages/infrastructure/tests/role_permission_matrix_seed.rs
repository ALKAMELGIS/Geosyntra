//! RBAC MATRIX seed parity — requires Postgres (`direnv allow` or DATABASE_URL).

use std::sync::Arc;

use infrastructure::{
    authz::matrix::{permissions_for_role, PERMISSION_SLUGS, ROLE_SLUGS},
    normalize_rbac_role,
    postgres::{connect, run_migrations},
    seed_default_tenant_matrix,
};

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn seeded_matrix_matches_express_counts() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");
    seed_default_tenant_matrix(pool.as_ref())
        .await
        .expect("seed");

    let perm_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM rbac_permissions")
        .fetch_one(pool.as_ref())
        .await
        .expect("count permissions");
    assert_eq!(perm_count.0, PERMISSION_SLUGS.len() as i64);

    for slug in ROLE_SLUGS {
        let normalized = normalize_rbac_role(slug);
        let expected = permissions_for_role(normalized).len() as i64;
        let role_id = format!("geosyntra-default:{normalized}");
        let actual: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM rbac_role_permissions WHERE role_id = $1",
        )
        .bind(role_id)
        .fetch_one(pool.as_ref())
        .await
        .expect("count role perms");
        assert_eq!(
            actual.0, expected,
            "permission count mismatch for role {normalized}"
        );
    }
}
