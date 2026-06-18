use domain::{
    DateTime, Description, Name, Permission, PermissionId, PermissionSlug, Role,
    RoleId,
};
use domain::error::DomainResult;

use crate::authz::{matrix, role_slug};

pub const DEFAULT_TENANT_ID: &str = "geosyntra-default";

/// Build a domain [`Role`] from an Express role slug using the static MATRIX.
pub fn role_from_slug(slug: &str) -> DomainResult<Role> {
    let normalized = role_slug::normalize_rbac_role(slug);
    let display = role_slug::rbac_role_to_display(normalized);
    let mut builder = Role::new(RoleId::new(normalized));
    builder
        .set_name(Name::new(display)?)
        .set_description(Description::new("Express MATRIX role")?)
        .set_is_system_role(true)
        .set_created_at(DateTime::new(0));

    for (idx, perm_slug) in matrix::permissions_for_role(normalized).iter().enumerate() {
        let slug = PermissionSlug::new(perm_slug)?;
        let (resource, action) = slug.to_resource_action()?;
        builder.add_permission(Permission::new(
            PermissionId::new(perm_slug),
            resource,
            action,
            Description::new(perm_slug)?,
            DateTime::new(0),
            idx as u64 + 1,
        ));
    }

    builder.build()
}
