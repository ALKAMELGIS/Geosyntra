//! Shared option loaders for admin CRUD forms.

use crate::{
    api::admin::{
        roles::{self, MatrixRoleRow},
        tenants::{self, TenantRow},
        users::{self, AdminUser},
    },
    error_display::ApiError,
};

#[derive(Debug, Clone, Default)]
pub struct AdminCatalog {
    pub roles: Vec<MatrixRoleRow>,
    pub tenants: Vec<TenantRow>,
    pub users: Vec<AdminUser>,
}

pub async fn load_catalog(token: &str) -> Result<AdminCatalog, ApiError> {
    let roles = roles::list_matrix(token).await?;
    let tenants = tenants::list_tenants(token).await?;
    let users = users::list_users(token).await?;
    Ok(AdminCatalog {
        roles,
        tenants,
        users,
    })
}

pub fn user_label(user: &AdminUser) -> String {
    let id = user.id.as_deref().unwrap_or("?");
    let name = user.display_name();
    let email = user
        .email
        .as_deref()
        .filter(|e| !e.is_empty())
        .unwrap_or("no email");
    format!("{name} ({email}) — id {id}")
}

pub fn tenant_label(tenant: &TenantRow) -> String {
    if tenant.is_platform_tenant {
        format!("{} ({}) — platform", tenant.name, tenant.id)
    } else {
        format!("{} ({})", tenant.name, tenant.id)
    }
}

/// Preset temporary-grant permissions (domain resource + action).
pub struct GrantPreset {
    pub resource: &'static str,
    pub action: &'static str,
    pub label: &'static str,
}

pub const GRANT_PRESETS: &[GrantPreset] = &[
    GrantPreset {
        resource: "admin_users",
        action: "read",
        label: "Read user directory",
    },
    GrantPreset {
        resource: "admin_users",
        action: "manage",
        label: "Manage users",
    },
    GrantPreset {
        resource: "admin_audit",
        action: "read",
        label: "Read audit log",
    },
    GrantPreset {
        resource: "admin_roles",
        action: "assign",
        label: "Assign roles",
    },
    GrantPreset {
        resource: "admin_panel",
        action: "access",
        label: "Open admin panel",
    },
];

pub fn grant_preset_key(resource: &str, action: &str) -> String {
    format!("{resource}.{action}")
}
