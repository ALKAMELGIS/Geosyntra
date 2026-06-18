use std::collections::HashSet;

use domain::{DateTime, RoleId, TenantId, UserId};

/// Partial SQL/API projection for membership reads — not a domain aggregate.
#[derive(Debug, Clone, Default)]
pub struct MembershipView {
    pub user_id: Option<UserId>,
    pub tenant_id: Option<TenantId>,
    pub roles: Option<HashSet<RoleId>>,
    pub created_at: Option<DateTime>,
    pub version: Option<u64>,
}
