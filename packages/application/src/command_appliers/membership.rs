use std::collections::HashSet;

use domain::{DateTime, Membership, RoleId};

use crate::{
    dto::tenant::command::MembershipCommand,
    error::{AppError, AppResult},
};

pub struct MembershipCommandApplier;

impl MembershipCommandApplier {
    pub fn from_create(cmd: MembershipCommand) -> AppResult<Membership> {
        let user_id = cmd
            .user_id
            .ok_or_else(|| AppError::ValidationError("membership user_id required".into()))?;
        let tenant_id = cmd
            .tenant_id
            .ok_or_else(|| AppError::ValidationError("membership tenant_id required".into()))?;
        let roles = cmd.roles.unwrap_or_default();
        Membership::require_non_empty(&roles)?;
        Ok(Membership::new(
            user_id,
            tenant_id,
            roles,
            cmd.created_at.unwrap_or_else(|| DateTime::new(0)),
            cmd.version.unwrap_or(1),
        ))
    }

    pub fn apply_set_roles(membership: Membership, roles: HashSet<RoleId>) -> AppResult<Membership> {
        Membership::require_non_empty(&roles)?;
        Ok(Membership::new(
            membership.user_id().clone(),
            membership.tenant_id().clone(),
            roles,
            *membership.created_at(),
            membership.version() + 1,
        ))
    }
}
