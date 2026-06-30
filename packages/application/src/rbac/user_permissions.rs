//! Effective Express permission slugs for a subject or role.

use std::collections::HashSet;

use crate::{rbac::matrix_export::permissions_for_role, SubjectContext};

/// Union of permission slugs from loaded roles (DB-backed when resolver populated roles).
pub fn permission_slugs_from_context(ctx: &SubjectContext) -> Vec<String> {
    let mut slugs: HashSet<String> = HashSet::new();
    for role in ctx.roles() {
        for perm in role.permissions() {
            slugs.insert(perm.id().as_str().to_string());
        }
    }
    let mut out: Vec<_> = slugs.into_iter().collect();
    out.sort_unstable();
    out
}

/// Resolve slugs for API responses — prefer role permissions from context, else static MATRIX.
pub fn resolve_permission_slugs(ctx: &SubjectContext, role_slug: Option<&str>) -> Vec<String> {
    let from_ctx = permission_slugs_from_context(ctx);
    if !from_ctx.is_empty() {
        return from_ctx;
    }
    role_slug
        .map(permissions_for_role)
        .map(|slugs| slugs.iter().map(|s| (*s).to_string()).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use domain::{
        DateTime, Description, Name, Permission, PermissionId, Role, RoleId,
        TenantId, UserId,
    };

    use super::*;

    fn role_with_slugs(id: &str, slugs: &[&str]) -> Role {
        let mut builder = Role::new(RoleId::new(id));
        builder
            .set_name(Name::new("Role").unwrap())
            .set_description(Description::new("Role").unwrap())
            .set_is_system_role(true)
            .set_created_at(DateTime::new(0));
        for (idx, slug) in slugs.iter().enumerate() {
            let (resource, action) = domain::PermissionSlug::new(slug)
                .unwrap()
                .to_resource_action()
                .unwrap();
            builder.add_permission(Permission::new(
                PermissionId::new(slug),
                resource,
                action,
                Description::new(slug).unwrap(),
                DateTime::new(0),
                idx as u64 + 1,
            ));
        }
        builder.build().unwrap()
    }

    #[test]
    fn collects_slugs_from_context_roles() {
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[role_with_slugs("geosyntra-default:owner", &["admin.panel", "app.access"])],
            &[],
        );
        let slugs = permission_slugs_from_context(&ctx);
        assert!(slugs.contains(&"admin.panel".to_string()));
        assert!(slugs.contains(&"app.access".to_string()));
    }

    #[test]
    fn falls_back_to_matrix_when_roles_empty() {
        let ctx = SubjectContext::new(UserId::new("u1"), TenantId::new("t1"), &[], &[]);
        let slugs = resolve_permission_slugs(&ctx, Some("trial_user"));
        assert_eq!(slugs.len(), 2);
        assert!(slugs.contains(&"app.access".to_string()));
        assert!(slugs.contains(&"aoi.read".to_string()));
    }
}
