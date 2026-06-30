use std::collections::HashSet;

use domain::{DateTime, RoleId, TenantId, UserId};

#[derive(Debug, Clone)]
pub struct MembershipCommand {
    pub user_id: Option<UserId>,
    pub tenant_id: Option<TenantId>,
    pub roles: Option<HashSet<RoleId>>,
    pub created_at: Option<DateTime>,
    pub version: Option<u64>,
}
