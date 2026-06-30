pub mod fields;

use crate::{
    value_objects::{Action, Resource},
    DateTime, Description, Event,
};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct PermissionId(String);

impl PermissionId {
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

impl std::ops::Deref for PermissionId {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for PermissionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Eq, Hash, PartialEq)]
pub struct Permission {
    id: PermissionId,
    resource: Resource,
    action: Action,
    description: Description,
    created_at: DateTime,
    version: u64,
}

#[derive(Debug, Clone, Eq, Hash, PartialEq)]
pub struct PermissionParts {
    pub id: PermissionId,
    pub resource: Resource,
    pub action: Action,
    pub description: Description,
    pub created_at: DateTime,
    pub version: u64,
}

impl Permission {
    pub fn new(
        id: PermissionId,
        resource: Resource,
        action: Action,
        description: Description,
        created_at: DateTime,
        version: u64,
    ) -> Self {
        Self {
            resource,
            action,
            description,
            created_at,
            version,
            id,
        }
    }

    pub fn into_parts(self) -> PermissionParts {
        let Self {
            resource,
            action,
            description,
            created_at,
            version,
            id,
        } = self;
        PermissionParts {
            resource,
            action,
            description,
            created_at,
            version,
            id,
        }
    }

    pub fn matches(&self, resource: &Resource, action: &Action) -> bool {
        &self.resource == resource && &self.action == action
    }

    pub fn id(&self) -> &PermissionId {
        &self.id
    }
    pub fn resource(&self) -> &Resource {
        &self.resource
    }

    pub fn action(&self) -> &Action {
        &self.action
    }
    pub fn description(&self) -> &Description {
        &self.description
    }

    pub fn created_at(&self) -> &DateTime {
        &self.created_at
    }

    pub fn version(&self) -> &u64 {
        &self.version
    }
}

impl Event for Permission {
    fn get_type(&self) -> &str {
        "PERMISSION"
    }
}
