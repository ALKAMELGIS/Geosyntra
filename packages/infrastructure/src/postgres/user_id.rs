use domain::UserId;
use sqlx::PgPool;

use crate::error::{map_sqlx, InfraResult};

/// Allocates the next `admin_users.id` from `admin_user_id_seq` (Task 9 / H3).
pub async fn next_user_id(pool: &PgPool) -> InfraResult<UserId> {
    let id: i64 = sqlx::query_scalar("SELECT nextval('admin_user_id_seq')")
        .fetch_one(pool)
        .await
        .map_err(map_sqlx)?;
    Ok(UserId::new(&id.to_string()))
}
