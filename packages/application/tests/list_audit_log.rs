use std::sync::Arc;

use application::{
    authorization::{allow_all::AllowAllPolicy, engine::AuthorizationEngine, neutral_environment},
    dto::audit::AuditEntryView,
    error::AppResult,
    ports::AuditRepository,
    usecases::audit::list::ListAuditLogUseCase,
    SubjectContext,
};
use domain::{DateTime, UserId};

struct MockAuditRepo;

#[async_trait::async_trait]
impl AuditRepository for MockAuditRepo {
    async fn list(&self, limit: u32) -> AppResult<Vec<AuditEntryView>> {
        Ok(vec![AuditEntryView {
            at: Some(DateTime::new(1)),
            actor: Some("admin@test.com".into()),
            action: Some("user_approved".into()),
            target: Some("user@test.com".into()),
        }]
        .into_iter()
        .take(limit as usize)
        .collect())
    }

    async fn append(
        &self,
        _actor: &str,
        _action: &str,
        _target: Option<&str>,
        _details: Option<&str>,
    ) -> AppResult<()> {
        Ok(())
    }
}

#[tokio::test]
async fn list_audit_log_returns_entries_when_authorized() {
    let mut engine = AuthorizationEngine::new();
    engine.register_policy(AllowAllPolicy);

    let use_case = ListAuditLogUseCase::new(Arc::new(MockAuditRepo), Arc::new(engine));
    let ctx = SubjectContext::new(
        UserId::new("admin"),
        domain::TenantId::new("t1"),
        &[],
        &[],
    );

    let entries = use_case
        .execute(ctx, neutral_environment(), 10)
        .await
        .unwrap();

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].action.as_deref(), Some("user_approved"));
}
