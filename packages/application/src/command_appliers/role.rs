use domain::{error::DomainResult, DateTime, Role};

use crate::dto::role::command::RoleCommand;

pub struct RoleCommandApplier;

impl RoleCommandApplier {
    pub fn from_create(cmd: RoleCommand) -> DomainResult<Role> {
        let id = cmd
            .id
            .ok_or(domain::DomainError::ValidationError("Role id required".into()))?;
        let mut builder = Role::new(id);
        if let Some(name) = cmd.name {
            builder.set_name(name);
        }
        if let Some(description) = cmd.description {
            builder.set_description(description);
        }
        builder.set_is_system_role(cmd.is_system_role.unwrap_or(false));
        builder.set_created_at(cmd.created_at.unwrap_or_else(|| DateTime::new(0)));
        builder.set_version(cmd.version.unwrap_or(1));
        builder.build()
    }

    pub fn apply_update(role: Role, cmd: &RoleCommand) -> DomainResult<Role> {
        let parts = role.into_parts();
        let mut builder = Role::new(parts.id);
        builder.set_name(cmd.name.clone().unwrap_or(parts.name));
        builder.set_description(cmd.description.clone().unwrap_or(parts.description));
        for permission in parts.permissions {
            builder.add_permission(permission);
        }
        builder.set_is_system_role(cmd.is_system_role.unwrap_or(parts.is_system_role));
        builder.set_created_at(cmd.created_at.unwrap_or(parts.created_at));
        builder.set_version(cmd.version.unwrap_or(parts.version.saturating_add(1)));
        builder.build()
    }
}
