use std::collections::HashSet;

use domain::{
    DateTime, Description, Name, Permission, PermissionId, PermissionSlug, Role, RoleId,
};
use sqlx::PgPool;

use crate::{
    authz::{matrix, role_from_slug, role_slug},
    error::{map_sqlx, InfraResult},
};

/// Load role from DB when seeded; `None` if no row (strict persistence path).
pub async fn try_load_role_by_id(pool: &PgPool, role_id: &str) -> InfraResult<Option<Role>> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT name, slug FROM rbac_roles WHERE id = $1 LIMIT 1",
    )
    .bind(role_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)?;

    let Some((display, slug)) = row else {
        return Ok(None);
    };

    load_role_permissions(pool, role_id, &display, &slug).await
}

/// Load role from DB when seeded; `None` if no row (strict persistence path).
pub async fn try_load_role_by_slug(
    pool: &PgPool,
    tenant_id: &str,
    slug: &str,
) -> InfraResult<Option<Role>> {
    let normalized = role_slug::normalize_rbac_role(slug);
    try_load_from_db(pool, tenant_id, normalized).await
}

/// Load role from DB, falling back to static Express MATRIX.
pub async fn load_role_by_slug(
    pool: &PgPool,
    tenant_id: &str,
    slug: &str,
) -> InfraResult<Role> {
    if let Some(role) = try_load_role_by_slug(pool, tenant_id, slug).await? {
        return Ok(role);
    }
    role_from_slug(slug).map_err(Into::into)
}

async fn try_load_from_db(
    pool: &PgPool,
    tenant_id: &str,
    normalized: &str,
) -> InfraResult<Option<Role>> {
    let role_id = format!("{tenant_id}:{normalized}");
    try_load_role_by_id(pool, &role_id).await
}

async fn load_role_permissions(
    pool: &PgPool,
    role_id: &str,
    display: &str,
    slug: &str,
) -> InfraResult<Option<Role>> {
    let slugs: Vec<String> = sqlx::query_scalar(
        "SELECT permission_slug FROM rbac_role_permissions WHERE role_id = $1 ORDER BY permission_slug",
    )
    .bind(role_id)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx)?;

    if slugs.is_empty() {
        return Ok(None);
    }

    let mut builder = Role::new(RoleId::new(role_id));
    builder
        .set_name(Name::new(display)?)
        .set_description(Description::new("RBAC role")?)
        .set_is_system_role(matrix::ROLE_SLUGS.contains(&slug))
        .set_created_at(DateTime::new(0));

    for (idx, perm_slug) in slugs.iter().enumerate() {
        let slug_vo = PermissionSlug::new(perm_slug)?;
        let (resource, action) = slug_vo.to_resource_action()?;
        builder.add_permission(Permission::new(
            PermissionId::new(perm_slug),
            resource,
            action,
            Description::new(perm_slug)?,
            DateTime::new(0),
            idx as u64 + 1,
        ));
    }

    Ok(Some(builder.build()?))
}

pub fn permissions_from_slugs(
    slugs: &[String],
) -> domain::error::DomainResult<HashSet<Permission>> {
    let mut out = HashSet::new();
    for (idx, perm_slug) in slugs.iter().enumerate() {
        let slug_vo = PermissionSlug::new(perm_slug)?;
        let (resource, action) = slug_vo.to_resource_action()?;
        out.insert(Permission::new(
            PermissionId::new(perm_slug),
            resource,
            action,
            Description::new(perm_slug)?,
            DateTime::new(0),
            idx as u64 + 1,
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permissions_from_slugs_maps_admin_users_read() {
        let perms = permissions_from_slugs(&["admin.users.read".to_string()]).unwrap();
        assert_eq!(perms.len(), 1);
        let p = perms.iter().next().unwrap();
        assert_eq!(p.resource().resource(), "admin_users");
        assert_eq!(p.action().action(), "read");
    }
}
