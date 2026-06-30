use async_trait::async_trait;

use crate::{error::AppResult, SubjectContext};

/// Ensures tenant-scoped stored ABAC policies are loaded into the authorization engine (M4).
#[async_trait]
pub trait PolicyReloadService: Send + Sync {
    async fn ensure_loaded(&self, ctx: &SubjectContext) -> AppResult<()>;

    /// Invalidate cache for a tenant after policy activation.
    async fn invalidate_tenant(&self, ctx: &SubjectContext) -> AppResult<()>;
}
