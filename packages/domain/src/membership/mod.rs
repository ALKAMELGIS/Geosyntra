pub mod fields;

use std::collections::HashSet;

use crate::error::DomainResult;
use crate::{DateTime, Event, RoleId, UserId};

use super::TenantId;
use crate::DomainError;

/// Tenant membership aggregate — immutable; mutations happen via commands in the application layer.
#[derive(Debug, Clone)]
pub struct Membership {
    user_id: UserId,
    tenant_id: TenantId,
    roles: HashSet<RoleId>,
    created_at: DateTime,
    version: u64,
}

#[derive(Debug, Clone)]
pub struct MembershipParts {
    pub user_id: UserId,
    pub tenant_id: TenantId,
    pub roles: HashSet<RoleId>,
    pub created_at: DateTime,
    pub version: u64,
}

impl Membership {
    pub fn new(
        user_id: UserId,
        tenant_id: TenantId,
        roles: HashSet<RoleId>,
        created_at: DateTime,
        version: u64,
    ) -> Self {
        Self {
            user_id,
            tenant_id,
            roles,
            created_at,
            version,
        }
    }

    pub fn into_parts(self) -> MembershipParts {
        let Self {
            user_id,
            tenant_id,
            roles,
            created_at,
            version,
        } = self;
        MembershipParts {
            user_id,
            tenant_id,
            roles,
            created_at,
            version,
        }
    }

    pub fn has_role(&self, role_id: &RoleId) -> bool {
        self.roles.iter().any(|p| p == role_id)
    }

    pub fn tenant_id(&self) -> &TenantId {
        &self.tenant_id
    }

    pub fn user_id(&self) -> &UserId {
        &self.user_id
    }
    pub fn roles(&self) -> &HashSet<RoleId> {
        &self.roles
    }

    pub fn created_at(&self) -> &DateTime {
        &self.created_at
    }

    pub fn version(&self) -> &u64 {
        &self.version
    }

    pub fn with_role_added(self, role_id: RoleId) -> Self {
        let mut roles = self.roles.clone();
        roles.insert(role_id);
        Self { roles, ..self }
    }

    pub fn with_role_removed(self, role_id: &RoleId) -> DomainResult<Self> {
        if !self.roles.contains(role_id) {
            return Err(DomainError::ValidationError(
                "Role not assigned to membership".into(),
            ));
        }
        let mut roles = self.roles.clone();
        roles.remove(role_id);
        Self::require_non_empty(&roles)?;
        Ok(Self { roles, ..self })
    }

    /// Plan alias — same invariant as [`Self::ensure_roles_not_empty`].
    pub fn require_non_empty(roles: &HashSet<RoleId>) -> DomainResult<()> {
        Self::ensure_roles_not_empty(roles)
    }

    pub fn ensure_roles_not_empty(roles: &HashSet<RoleId>) -> DomainResult<()> {
        if roles.is_empty() {
            return Err(DomainError::ValidationError(
                "Membership must have at least one role".into(),
            ));
        }
        Ok(())
    }
}

impl Event for Membership {
    fn get_type(&self) -> &str {
        "MEMBERSHIP"
    }
}
