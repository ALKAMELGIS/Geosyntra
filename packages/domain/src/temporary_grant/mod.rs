pub mod fields;
use std::collections::HashSet;

use crate::{
    value_objects::{Action, Resource},
    DateTime, Description, Event, Permission, UserId,
};

#[derive(Debug, Clone)]
pub struct TemporaryGrant {
    user_id: UserId,
    description: Description,
    permissions: HashSet<Permission>,
    expires_at: DateTime,
    created_at: DateTime,
    version: u64,
}

#[derive(Debug, Clone)]
pub struct TemporaryGrantParts {
    pub user_id: UserId,
    pub description: Description,
    pub permissions: HashSet<Permission>,
    pub expires_at: DateTime,
    pub created_at: DateTime,
    pub version: u64,
}

impl TemporaryGrant {
    pub fn new(
        user_id: UserId,
        description: Description,
        permissions: HashSet<Permission>,
        expires_at: DateTime,
        created_at: DateTime,
        version: u64,
    ) -> Self {
        Self {
            user_id,
            expires_at,
            description,
            created_at,
            permissions,
            version,
        }
    }

    pub fn into_parts(self) -> TemporaryGrantParts {
        let Self {
            user_id,
            description,
            permissions,
            expires_at,
            created_at,
            version,
        } = self;
        TemporaryGrantParts {
            user_id,
            description,
            permissions,
            expires_at,
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

    pub fn user_id(&self) -> &UserId {
        &self.user_id
    }
    pub fn description(&self) -> &Description {
        &self.description
    }

    pub fn permissions(&self) -> &HashSet<Permission> {
        &self.permissions
    }
    pub fn created_at(&self) -> &DateTime {
        &self.created_at
    }
    pub fn expires_at(&self) -> &DateTime {
        &self.expires_at
    }
    pub fn version(&self) -> &u64 {
        &self.version
    }

    pub fn is_expired(&self, now: &DateTime) -> bool {
        now.is_after(self.expires_at())
    }

    pub fn is_valid(&self, now: &DateTime) -> bool {
        !self.is_expired(now)
    }
}

impl Event for TemporaryGrant {
    fn get_type(&self) -> &str {
        "TEMPORARYGRANT"
    }
}
