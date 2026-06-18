use async_trait::async_trait;

use crate::{
    authorization::policys::ApplicationStoredPolicy,
    dto::policy::{
        ActivatePolicyVersionCommand, CreatePolicyVersionCommand, PolicyVersionId,
        PolicyVersionSummaryView, PolicyVersionView, UpdatePolicyVersionCommand,
    },
    error::AppResult,
    SubjectContext,
};

#[async_trait]
pub trait PolicyRepository: Send + Sync {
    async fn list_versions(&self, ctx: SubjectContext) -> AppResult<Vec<PolicyVersionSummaryView>>;

    async fn fetch_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
    ) -> AppResult<PolicyVersionView>;

    async fn create_version(
        &self,
        ctx: SubjectContext,
        command: CreatePolicyVersionCommand,
    ) -> AppResult<PolicyVersionId>;

    async fn update_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
        command: UpdatePolicyVersionCommand,
    ) -> AppResult<()>;

    async fn delete_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
    ) -> AppResult<bool>;

    async fn activate_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
        command: ActivatePolicyVersionCommand,
    ) -> AppResult<()>;

    /// Policies from the active version for the subject tenant — merged into the authorization engine.
    async fn load_active_policies(&self, ctx: &SubjectContext) -> AppResult<Vec<ApplicationStoredPolicy>>;
}
