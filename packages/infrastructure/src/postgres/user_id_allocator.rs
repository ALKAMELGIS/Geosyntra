use std::sync::Arc;

use application::{error::AppResult, ports::UserIdAllocator};
use domain::UserId;
use sqlx::PgPool;

use crate::postgres::user_id::next_user_id;

pub struct PostgresUserIdAllocator {
    pool: Arc<PgPool>,
}

impl PostgresUserIdAllocator {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl UserIdAllocator for PostgresUserIdAllocator {
    async fn allocate(&self) -> AppResult<UserId> {
        next_user_id(self.pool.as_ref()).await
    }
}
