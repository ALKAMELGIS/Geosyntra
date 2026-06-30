use std::collections::HashSet;

use domain::{DateTime, Description, Name, PermissionId, RoleId};

#[derive(Debug, Clone)]
pub struct RoleCommand {
    pub id: Option<RoleId>,
    pub name: Option<Name>,
    pub description: Option<Description>,
    pub permissions: HashSet<PermissionId>,
    pub is_system_role: Option<bool>,
    pub created_at: Option<DateTime>,
    pub version: Option<u64>,
}
