//! Express RBAC role slug normalization — mirrors `backend/server/rbac/roles.js`.

/// Normalize arbitrary role input to a canonical slug.
pub fn normalize_rbac_role(value: &str) -> &'static str {
    let raw = value.trim().to_ascii_lowercase().replace(' ', "_");
    if raw.is_empty() {
        return "trial_user";
    }
    match raw.as_str() {
        "super_admin" | "superadmin" | "super" => "super_admin",
        "owner" => "owner",
        "admin" => "admin",
        "manager" | "admin_manager" | "admin-manager" => "manager",
        "analyst" | "editor" => "analyst",
        "viewer" | "user" => "viewer",
        "ai_operator" | "ai" | "aioperator" => "ai_operator",
        "trial_user" | "trial" => "trial_user",
        _ => "trial_user",
    }
}

/// Map display label from `admin_users.role` to slug.
pub fn display_role_to_slug(display: &str) -> &'static str {
    normalize_rbac_role(display)
}

pub fn rbac_role_to_display(slug: &str) -> &'static str {
    match normalize_rbac_role(slug) {
        "super_admin" => "Super Admin",
        "owner" => "Owner",
        "admin" => "Admin",
        "manager" => "Manager",
        "analyst" => "Analyst",
        "viewer" => "Viewer",
        "ai_operator" => "AI Operator",
        _ => "Trial User",
    }
}

pub fn role_rank(slug: &str) -> i32 {
    match normalize_rbac_role(slug) {
        "trial_user" => 6,
        "viewer" | "user" => 14,
        "ai_operator" => 18,
        "analyst" => 20,
        "manager" => 30,
        "admin" => 40,
        "owner" | "super_admin" => 50,
        _ => 0,
    }
}

/// Status after email verification — mirrors Express `statusAfterEmailVerify`.
pub fn status_after_email_verify(role_display: &str) -> &'static str {
    match display_role_to_slug(role_display) {
        "viewer" | "manager" | "ai_operator" => "Pending Approval",
        _ => "Active",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_user_to_viewer() {
        assert_eq!(normalize_rbac_role("User"), "viewer");
    }

    #[test]
    fn normalizes_super_admin_aliases() {
        assert_eq!(normalize_rbac_role("super"), "super_admin");
    }
}
