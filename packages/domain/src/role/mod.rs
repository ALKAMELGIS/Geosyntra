pub mod fields;
pub mod relations;

use std::collections::HashSet;
use std::ops::Deref;

use crate::error::DomainResult;
use crate::permissions::PermissionId;

pub use super::permissions::Permission;

use crate::value_objects::{Action, DateTime, Description, Resource};
use crate::{DomainError, Event, Name};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RoleId(String);

impl RoleId {
    pub fn new(id: &str) -> Self {
        Self(id.into())
    }
    pub fn id(&self) -> &str {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Deref for RoleId {
    type Target = str;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Debug, Clone)]
pub struct Role {
    id: RoleId,
    name: Name,
    description: Description,
    permissions: HashSet<Permission>,
    is_system_role: bool,
    created_at: DateTime,
    version: u64,
}
#[derive(Debug, Clone)]
pub struct RoleParts {
    pub id: RoleId,
    pub name: Name,
    pub description: Description,
    pub permissions: HashSet<Permission>,
    pub is_system_role: bool,
    pub created_at: DateTime,
    pub version: u64,
}

impl Role {
    pub fn new(id: RoleId) -> RoleBuilder {
        RoleBuilder::new(id)
    }

    pub fn into_parts(self) -> RoleParts {
        let Self {
            id,
            name,
            description,
            permissions,
            is_system_role,
            created_at,
            version,
        } = self;
        RoleParts {
            id,
            name,
            description,
            permissions,
            is_system_role,
            created_at,
            version,
        }
    }

    pub fn has_permission(&self, resource: &Resource, action: &Action) -> bool {
        for permission in self.permissions.iter() {
            if permission.matches(resource, action) {
                return true;
            }
        }
        false
    }

    pub fn id(&self) -> &RoleId {
        &self.id
    }

    pub fn name(&self) -> &Name {
        &self.name
    }
    pub fn description(&self) -> &Description {
        &self.description
    }

    pub fn permissions(&self) -> &HashSet<Permission> {
        &self.permissions
    }

    pub fn is_system_role(&self) -> bool {
        self.is_system_role
    }

    pub fn created_at(&self) -> &DateTime {
        &self.created_at
    }
    pub fn version(&self) -> &u64 {
        &self.version
    }

    pub fn with_permission_added(self, permission: Permission) -> Self {
        let mut permissions = self.permissions.clone();
        permissions.insert(permission);
        Self {
            permissions,
            ..self
        }
    }

    pub fn with_permission_removed(self, permission_id: &PermissionId) -> DomainResult<Self> {
        let permission = self
            .permissions
            .iter()
            .find(|p| p.id() == permission_id)
            .cloned()
            .ok_or(DomainError::ValidationError(
                "Permission not assigned to role".into(),
            ))?;
        let mut permissions = self.permissions.clone();
        permissions.remove(&permission);
        Ok(Self {
            permissions,
            ..self
        })
    }
}

#[derive(Debug, Clone)]
pub struct RoleBuilder {
    id: RoleId,
    name: Option<Name>,
    description: Option<Description>,
    permissions: HashSet<Permission>,
    is_system_role: Option<bool>,
    created_at: Option<DateTime>,
    version: u64,
}

impl RoleBuilder {
    pub fn new(id: RoleId) -> Self {
        Self {
            id,
            name: None,
            description: None,
            permissions: HashSet::new(),
            is_system_role: None,
            created_at: None,
            version: 0,
        }
    }

    pub fn set_name(&mut self, name: Name) -> &mut Self {
        self.name = Some(name);
        self
    }
    pub fn set_version(&mut self, version: u64) -> &mut Self {
        self.version = version;
        self
    }
    pub fn set_description(&mut self, description: Description) -> &mut Self {
        self.description = Some(description);
        self
    }

    pub fn add_permission(&mut self, permission: Permission) -> &mut Self {
        self.permissions.insert(permission);
        self
    }

    pub fn set_is_system_role(&mut self, is_system_role: bool) -> &mut Self {
        self.is_system_role = Some(is_system_role);
        self
    }

    pub fn set_created_at(&mut self, created_at: DateTime) -> &mut Self {
        self.created_at = Some(created_at);
        self
    }

    pub fn build(self) -> DomainResult<Role> {
        Ok(Role {
            id: self.id,
            name: self
                .name
                .ok_or(DomainError::ValidationError("Name not found".into()))?,
            description: self
                .description
                .ok_or(DomainError::ValidationError("Description not found".into()))?,
            permissions: self.permissions,
            is_system_role: self.is_system_role.ok_or(DomainError::ValidationError(
                "Is System Role not found".into(),
            ))?,
            created_at: self
                .created_at
                .ok_or(DomainError::ValidationError("Created At not found".into()))?,
            version: self.version,
        })
    }
}

impl Event for Role {
    fn get_type(&self) -> &str {
        "ROLE"
    }
}
