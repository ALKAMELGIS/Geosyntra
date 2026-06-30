//! Postgres integration tests — require `DATABASE_URL` pointing at a test database.
//!
//! ```bash
//! DATABASE_URL=postgres://... cargo test -p infrastructure --test postgres_integration -- --ignored
//! ```

use std::sync::Arc;

use application::{
    ports::{AuditRepository, MembershipReadRepository},
    SubjectContext,
};
use domain::{TenantId, UserId};
use infrastructure::postgres::{
    connect, run_migrations, PostgresAuditRepository, PostgresMembershipRepository,
};

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn migrations_apply_and_audit_repo_lists() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");

    let repo = PostgresAuditRepository::new(pool);
    let entries = repo.list(5).await.expect("list audit");
    assert!(entries.len() <= 5);
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn membership_find_tenant_for_user_returns_none_when_missing() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");

    let repo = PostgresMembershipRepository::new(pool);
    let ctx = SubjectContext::new(
        UserId::new("1"),
        TenantId::new("geosyntra-default"),
        &[],
        &[],
    );
    let tenant = repo
        .find_tenant_for_user(ctx, UserId::new("999999999"))
        .await
        .expect("lookup");
    assert!(tenant.is_none());
}
