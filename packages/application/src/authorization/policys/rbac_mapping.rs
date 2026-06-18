use domain::{Action, DomainError, Resource};

/// Maps use-case [`UseCaseDescriptor`](crate::usecases::usecase_descriptor::UseCaseDescriptor)
/// resource/action strings to domain RBAC pairs aligned with Express slugs
/// (see `migration/permission-slug-matrix.md`).
pub fn map_use_case_to_domain(
    resource_type: &str,
    action: &str,
) -> Result<(Resource, Action), DomainError> {
    let (domain_resource, domain_action) = match (resource_type, action) {
        ("user", "read") | ("user", "list") => ("admin_users", "read"),
        ("user", "create") | ("user", "update") | ("user", "delete") => ("admin_users", "manage"),
        ("user", "approve") => ("admin_users", "approve"),
        ("user", "suspend") | ("user", "reactivate") => ("admin_users", "suspend"),
        ("role", "read") | ("role", "list") => ("admin_panel", "access"),
        ("role", "create") | ("role", "update") | ("role", "delete") => ("admin_roles", "assign"),
        ("policy", "read") | ("policy", "list") => ("admin_panel", "access"),
        ("policy", "create") | ("policy", "update") | ("policy", "delete") => {
            ("admin_roles", "assign")
        }
        ("membership", "read") | ("membership", "list") => ("admin_panel", "access"),
        ("membership", "create") | ("membership", "update") | ("membership", "set_role")
        | ("membership", "delete") => ("admin_roles", "assign"),
        ("audit", "read") | ("audit", "list") => ("admin_audit", "read"),
        ("invite", "read") | ("invite", "list") | ("invite", "preview") => {
            ("admin_invites", "create")
        }
        ("invite", "create") | ("invite", "accept") => ("admin_invites", "create"),
        ("auth", "read") | ("auth", "login") | ("auth", "register") | ("auth", "refresh") => {
            ("app", "access")
        }
        ("billing", "read") | ("billing", "list") => ("app", "access"),
        ("billing", "update") | ("billing", "create") => ("app", "access"),
        ("tenant", "read") | ("tenant", "list") | ("tenant", "propose") => {
            ("platform_tenant", "manage")
        }
        ("governance", "create")
        | ("governance", "list")
        | ("governance", "read")
        | ("governance", "approve")
        | ("governance", "reject") => ("admin_roles", "assign"),
        ("temporary_grant", "list") | ("temporary_grant", "read") => ("admin_panel", "access"),
        ("temporary_grant", "create") | ("temporary_grant", "delete") => {
            ("admin_roles", "assign")
        }
        _ => {
            return Err(DomainError::ValidationError(
                format!("unknown use-case permission mapping: {resource_type}.{action}").into(),
            ));
        }
    };
    Ok((
        Resource::new(domain_resource)?,
        Action::new(domain_action)?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_user_read_to_admin_users_read() {
        let (resource, action) = map_use_case_to_domain("user", "read").unwrap();
        assert_eq!(resource.resource(), "admin_users");
        assert_eq!(action.action(), "read");
    }

    #[test]
    fn maps_user_delete_to_admin_users_manage() {
        let (resource, action) = map_use_case_to_domain("user", "delete").unwrap();
        assert_eq!(resource.resource(), "admin_users");
        assert_eq!(action.action(), "manage");
    }

    #[test]
    fn maps_user_approve_to_admin_users_approve() {
        let (resource, action) = map_use_case_to_domain("user", "approve").unwrap();
        assert_eq!(resource.resource(), "admin_users");
        assert_eq!(action.action(), "approve");
    }

    #[test]
    fn maps_user_suspend_to_admin_users_suspend() {
        let (_resource, action) = map_use_case_to_domain("user", "suspend").unwrap();
        assert_eq!(action.action(), "suspend");
    }

    #[test]
    fn maps_role_list_to_admin_panel_access() {
        let (resource, action) = map_use_case_to_domain("role", "list").unwrap();
        assert_eq!(resource.resource(), "admin_panel");
        assert_eq!(action.action(), "access");
    }

    #[test]
    fn maps_role_create_to_admin_roles_assign() {
        let (resource, action) = map_use_case_to_domain("role", "create").unwrap();
        assert_eq!(resource.resource(), "admin_roles");
        assert_eq!(action.action(), "assign");
    }

    #[test]
    fn maps_audit_list_to_admin_audit_read() {
        let (resource, action) = map_use_case_to_domain("audit", "list").unwrap();
        assert_eq!(resource.resource(), "admin_audit");
        assert_eq!(action.action(), "read");
    }

    #[test]
    fn maps_invite_create_to_admin_invites_create() {
        let (resource, action) = map_use_case_to_domain("invite", "create").unwrap();
        assert_eq!(resource.resource(), "admin_invites");
        assert_eq!(action.action(), "create");
    }

    #[test]
    fn rejects_unknown_use_case_pair() {
        assert!(map_use_case_to_domain("gateway", "proxy").is_err());
    }
}
