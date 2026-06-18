//! Temporary grants table migration — requires Postgres.

use infrastructure::postgres::{connect, run_migrations};

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn temporary_grants_table_exists() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = connect(&url).await.expect("connect");
    run_migrations(&pool).await.expect("migrate");

    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'temporary_grants'",
    )
    .fetch_one(&pool)
    .await
    .expect("query");
    assert_eq!(row.0, 1);
}
