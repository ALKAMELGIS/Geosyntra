use domain::{
    Action, DateTime, PermissionSlug, Resource, Role, RoleId, TemporaryGrant, TenantId, UserId,
};

/// Request-scoped authorization subject — roles and grants loaded at construction (see
/// [`migration/jwt-role-membership-bridge.md`](../../migration/jwt-role-membership-bridge.md)).
#[derive(Debug, Clone)]
pub struct SubjectContext {
    user_id: UserId,
    tenant_id: TenantId,
    roles: Vec<Role>,
    temporary_grants: Vec<TemporaryGrant>,
}

impl SubjectContext {
    pub fn new(
        user_id: UserId,
        tenant_id: TenantId,
        roles: &[Role],
        temporary_grants: &[TemporaryGrant],
    ) -> Self {
        Self {
            user_id,
            tenant_id,
            roles: roles.to_vec(),
            temporary_grants: temporary_grants.to_vec(),
        }
    }

    pub fn user_id(&self) -> &UserId {
        &self.user_id
    }

    pub fn tenant_id(&self) -> &TenantId {
        &self.tenant_id
    }

    pub fn roles(&self) -> &[Role] {
        &self.roles
    }

    pub fn temporary_grants(&self) -> &[TemporaryGrant] {
        &self.temporary_grants
    }

    pub fn has_role(&self, role_id: &RoleId) -> bool {
        self.roles.iter().any(|role| role.id() == role_id)
    }

    /// Grants that have not expired at `now`.
    pub fn active_grants(&self, now: &DateTime) -> impl Iterator<Item = &TemporaryGrant> {
        self.temporary_grants
            .iter()
            .filter(move |grant| grant.is_valid(now))
    }

    pub fn has_permission(&self, resource: &Resource, action: &Action, now: &DateTime) -> bool {
        self.roles
            .iter()
            .any(|role| role.has_permission(resource, action))
            || self
                .active_grants(now)
                .any(|grant| grant.has_permission(resource, action))
    }

    pub fn has_permission_slug(
        &self,
        slug: &PermissionSlug,
        now: &DateTime,
    ) -> Result<bool, domain::DomainError> {
        let (resource, action) = slug.to_resource_action()?;
        Ok(self.has_permission(&resource, &action, now))
    }

    pub fn add_role(&mut self, role: Role) {
        self.roles.push(role);
    }

    pub fn add_roles(&mut self, roles: &[Role]) {
        self.roles.extend_from_slice(roles);
    }

    pub fn add_temporary_grant(&mut self, grant: TemporaryGrant) {
        self.temporary_grants.push(grant);
    }

    pub fn add_temporary_grants(&mut self, grants: &[TemporaryGrant]) {
        self.temporary_grants.extend_from_slice(grants);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use domain::{Description, Name, Permission, PermissionId};

    use super::*;

    fn sample_role(id: &str, resource: &str, action: &str) -> Role {
        let mut builder = Role::new(RoleId::new(id));
        builder
            .set_name(Name::new("Admin").unwrap())
            .set_description(Description::new("Admin role").unwrap())
            .add_permission(Permission::new(
                PermissionId::new("p1"),
                Resource::new(resource).unwrap(),
                Action::new(action).unwrap(),
                Description::new("perm").unwrap(),
                DateTime::new(0),
                1,
            ))
            .set_is_system_role(true)
            .set_created_at(DateTime::new(0));
        builder.build().unwrap()
    }

    fn expired_grant(resource: &str, action: &str) -> TemporaryGrant {
        TemporaryGrant::new(
            UserId::new("u1"),
            Description::new("expired").unwrap(),
            HashSet::from([Permission::new(
                PermissionId::new("g1"),
                Resource::new(resource).unwrap(),
                Action::new(action).unwrap(),
                Description::new("grant").unwrap(),
                DateTime::new(0),
                1,
            )]),
            DateTime::new(100),
            DateTime::new(0),
            1,
        )
    }

    #[test]
    fn has_role_matches_role_id() {
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[sample_role("admin", "admin_users", "read")],
            &[],
        );
        assert!(ctx.has_role(&RoleId::new("admin")));
        assert!(!ctx.has_role(&RoleId::new("viewer")));
    }

    #[test]
    fn has_permission_from_role() {
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[sample_role("admin", "admin_users", "read")],
            &[],
        );
        let resource = Resource::new("admin_users").unwrap();
        let action = Action::new("read").unwrap();
        assert!(ctx.has_permission(&resource, &action, &DateTime::new(1)));
    }

    #[test]
    fn expired_grants_do_not_elevate_permissions() {
        let resource = Resource::new("aoi").unwrap();
        let action = Action::new("write").unwrap();
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[],
            &[expired_grant("aoi", "write")],
        );
        assert!(!ctx.has_permission(&resource, &action, &DateTime::new(200)));
    }

    #[test]
    fn has_permission_slug_resolves_express_alias() {
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[sample_role("ai", "ai_chat", "run")],
            &[],
        );
        let slug = PermissionSlug::new("ai.run").unwrap();
        assert!(ctx.has_permission_slug(&slug, &DateTime::new(1)).unwrap());
    }
}
