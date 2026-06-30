use crate::{dto::audit::AuditEntryView, error::AppResult};

#[async_trait::async_trait]
pub trait AuditRepository: Send + Sync {
    async fn list(&self, limit: u32) -> AppResult<Vec<AuditEntryView>>;

    async fn append(
        &self,
        actor: &str,
        action: &str,
        target: Option<&str>,
        details: Option<&str>,
    ) -> AppResult<()>;
}
