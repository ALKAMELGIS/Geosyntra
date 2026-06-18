use std::sync::Arc;

use application::{error::AppResult, ports::TenantBootstrapService};
use sqlx::PgPool;

use crate::authz::{seed_default_abac_policy, seed_rbac_matrix};

pub struct PostgresTenantBootstrapService {
    pool: Arc<PgPool>,
}

impl PostgresTenantBootstrapService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl TenantBootstrapService for PostgresTenantBootstrapService {
    async fn bootstrap_new_tenant(&self, tenant_id: &str) -> AppResult<()> {
        seed_rbac_matrix(self.pool.as_ref(), tenant_id)
            .await
            .map_err(|e| application::error::AppError::Repository(e.to_string()))?;
        seed_default_abac_policy(self.pool.as_ref(), tenant_id)
            .await
            .map_err(|e| application::error::AppError::Repository(e.to_string()))?;
        Ok(())
    }
}
