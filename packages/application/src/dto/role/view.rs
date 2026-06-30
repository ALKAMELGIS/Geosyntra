use std::collections::HashSet;

use domain::{
    value_objects::{Action, Resource},
    DateTime, Description, Name, PermissionId, RoleId,
};

#[derive(Debug, Clone, Default)]
pub struct RoleView {
    pub id: Option<RoleId>,
    pub name: Option<Name>,
    pub description: Option<Description>,
    pub permissions: HashSet<PermissionView>,
    pub is_system_role: Option<bool>,
    pub created_at: Option<DateTime>,
    pub version: Option<u64>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct PermissionView {
    pub id: Option<PermissionId>,
    pub resource: Option<Resource>,
    pub action: Option<Action>,
    pub description: Option<Description>,
    pub created_at: Option<DateTime>,
    pub version: Option<u64>,
}
