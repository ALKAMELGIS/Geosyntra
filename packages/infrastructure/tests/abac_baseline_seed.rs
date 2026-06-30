//! ABAC baseline seed integration (Task 23.5).

use infrastructure::authz::{seed_default_abac_policy, seed_rbac_matrix, DEFAULT_TENANT_ID};

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn seed_default_abac_policy_is_idempotent() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = sqlx::PgPool::connect(&url).await.expect("connect");
    seed_rbac_matrix(&pool, DEFAULT_TENANT_ID)
        .await
        .expect("rbac seed");
    seed_default_abac_policy(&pool, DEFAULT_TENANT_ID)
        .await
        .expect("abac seed first");
    seed_default_abac_policy(&pool, DEFAULT_TENANT_ID)
        .await
        .expect("abac seed second");

    let active: String = sqlx::query_scalar(
        "SELECT id FROM authorization_policy_versions WHERE tenant_id = $1 AND is_active = TRUE LIMIT 1",
    )
    .bind(DEFAULT_TENANT_ID)
    .fetch_one(&pool)
    .await
    .expect("active version");
    assert!(active.contains("express-baseline-v1"));

    let rule_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM authorization_policies WHERE version_id = $1",
    )
    .bind(&active)
    .fetch_one(&pool)
    .await
    .expect("rule count");
    assert!(
        rule_count >= 10,
        "dev baseline should seed ABAC rules, got {rule_count}"
    );
}
