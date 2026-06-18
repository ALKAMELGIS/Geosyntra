//! Static RBAC permissions matrix export (mirrors Express `permissionsMatrixExport`).

use super::role_slug::{normalize_rbac_role, role_rank};

pub const PERMISSION_SLUGS: &[&str] = &[
    "app.access",
    "admin.panel",
    "admin.users.read",
    "admin.users.manage",
    "admin.users.approve",
    "admin.users.suspend",
    "admin.roles.assign",
    "admin.invites.create",
    "admin.audit.read",
    "admin.settings.manage",
    "admin.tokens.read",
    "admin.tokens.manage",
    "aoi.read",
    "aoi.write",
    "analytics.run",
    "reports.write",
    "ai.run",
    "platform.tenant.manage",
    "platform.policy.manage",
    "platform.config.manage",
    "platform.grant.manage",
    "platform.membership.manage",
];

pub fn permissions_for_role(slug: &str) -> &'static [&'static str] {
    match normalize_rbac_role(slug) {
        "trial_user" => &["app.access", "aoi.read"],
        "viewer" | "user" => &[
            "app.access",
            "aoi.read",
            "admin.panel",
            "admin.users.read",
        ],
        "analyst" => &[
            "app.access",
            "aoi.read",
            "aoi.write",
            "analytics.run",
            "reports.write",
            "admin.panel",
            "admin.users.read",
            "admin.audit.read",
        ],
        "ai_operator" => &[
            "app.access",
            "aoi.read",
            "analytics.run",
            "ai.run",
            "admin.panel",
            "admin.users.read",
        ],
        "manager" => &[
            "app.access",
            "aoi.read",
            "aoi.write",
            "analytics.run",
            "reports.write",
            "admin.panel",
            "admin.users.read",
            "admin.users.manage",
            "admin.users.approve",
            "admin.users.suspend",
            "admin.invites.create",
            "admin.audit.read",
        ],
        "admin" => &[
            "app.access",
            "aoi.read",
            "aoi.write",
            "analytics.run",
            "reports.write",
            "admin.panel",
            "admin.users.read",
            "admin.users.manage",
            "admin.users.approve",
            "admin.users.suspend",
            "admin.roles.assign",
            "admin.invites.create",
            "admin.audit.read",
            "admin.settings.manage",
            "admin.tokens.read",
            "ai.run",
        ],
        "owner" | "super_admin" => PERMISSION_SLUGS,
        _ => &["app.access", "aoi.read"],
    }
}

pub const ROLE_SLUGS: &[&str] = &[
    "trial_user",
    "viewer",
    "user",
    "analyst",
    "ai_operator",
    "manager",
    "admin",
    "owner",
    "super_admin",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatrixRoleExport {
    pub role: String,
    pub permissions: Vec<String>,
    pub rank: u32,
}

pub fn permissions_matrix_export() -> Vec<MatrixRoleExport> {
    ROLE_SLUGS
        .iter()
        .map(|slug| MatrixRoleExport {
            role: (*slug).to_string(),
            permissions: permissions_for_role(slug)
                .iter()
                .map(|p| (*p).to_string())
                .collect(),
            rank: role_rank(slug),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_has_all_platform_permissions() {
        assert_eq!(permissions_for_role("owner").len(), PERMISSION_SLUGS.len());
    }

    #[test]
    fn export_includes_all_roles() {
        let matrix = permissions_matrix_export();
        assert_eq!(matrix.len(), ROLE_SLUGS.len());
        assert!(matrix.iter().any(|row| row.role == "admin"));
    }
}
