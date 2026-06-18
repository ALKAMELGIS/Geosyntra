use domain::Role;

use crate::{
    authorization::access_descriptor::AccessControl,
    dto::role::view::{PermissionView, RoleView},
    projection::fields::permissions::PermissionField,
    projection::fields::role::RoleField,
};

pub struct RoleProjector;

impl RoleProjector {
    pub fn from_domain(role: &Role) -> RoleView {
        let parts = role.clone().into_parts();
        RoleView {
            id: Some(parts.id),
            name: Some(parts.name),
            description: Some(parts.description),
            permissions: parts
                .permissions
                .into_iter()
                .map(|p| {
                    let pp = p.into_parts();
                    PermissionView {
                        id: Some(pp.id),
                        resource: Some(pp.resource),
                        action: Some(pp.action),
                        description: Some(pp.description),
                        created_at: Some(pp.created_at),
                        version: Some(pp.version),
                    }
                })
                .collect::<std::collections::HashSet<_>>(),
            is_system_role: Some(parts.is_system_role),
            created_at: Some(parts.created_at),
            version: Some(parts.version),
        }
    }

    pub fn apply_access(view: &mut RoleView, access: &AccessControl<RoleField>) {
        if !access.can_read {
            *view = RoleView::default();
            return;
        }

        let readable = &access.readable_fields;
        if !readable.contains(&RoleField::Id) {
            view.id = None;
        }
        if !readable.contains(&RoleField::Name) {
            view.name = None;
        }
        if !readable.contains(&RoleField::Description) {
            view.description = None;
        }
        if !readable.contains(&RoleField::IsSystemRole) {
            view.is_system_role = None;
        }
        if !readable.contains(&RoleField::CreatedAt) {
            view.created_at = None;
        }
        if !readable.contains(&RoleField::Version) {
            view.version = None;
        }
        if !readable.contains(&RoleField::Permissions(PermissionField::Id)) {
            view.permissions.clear();
        }
    }

    pub fn present(mut view: RoleView, access: &AccessControl<RoleField>) -> RoleView {
        Self::apply_access(&mut view, access);
        view
    }
}
