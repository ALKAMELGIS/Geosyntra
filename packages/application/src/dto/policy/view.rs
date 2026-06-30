use domain::{DateTime, TenantId};

use crate::authorization::policys::ApplicationStoredPolicy;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PolicyVersionId(String);

impl PolicyVersionId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for PolicyVersionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone)]
pub struct PolicyVersionView {
    pub id: PolicyVersionId,
    pub tenant_id: TenantId,
    pub version: u32,
    pub label: String,
    pub is_active: bool,
    pub policies: Vec<ApplicationStoredPolicy>,
    pub created_at: DateTime,
    pub activated_at: Option<DateTime>,
}

#[derive(Debug, Clone)]
pub struct PolicyVersionSummaryView {
    pub id: PolicyVersionId,
    pub tenant_id: TenantId,
    pub version: u32,
    pub label: String,
    pub is_active: bool,
    pub policy_count: u32,
    pub created_at: DateTime,
    pub activated_at: Option<DateTime>,
}
