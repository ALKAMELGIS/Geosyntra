use crate::RoleId;

#[derive(Debug, Clone)]
pub struct TenantAuthorizationConfig {
    allow_cross_tenant_access: bool,
    require_reviewer_for_publish: bool,
    default_role: Option<RoleId>,
}

#[derive(Debug, Clone)]
pub struct TenantAuthorizationConfigParts {
    pub allow_cross_tenant_access: bool,
    pub require_reviewer_for_publish: bool,
    pub default_role: Option<RoleId>,
}

impl TenantAuthorizationConfig {
    pub fn new(
        allow_cross_tenant_access: bool,
        require_reviewer_for_publish: bool,
        default_role: Option<RoleId>,
    ) -> Self {
        Self {
            allow_cross_tenant_access,
            require_reviewer_for_publish,
            default_role,
        }
    }

    pub fn into_parts(self) -> TenantAuthorizationConfigParts {
        let Self {
            allow_cross_tenant_access,
            require_reviewer_for_publish,
            default_role,
        } = self;
        TenantAuthorizationConfigParts {
            allow_cross_tenant_access,
            require_reviewer_for_publish,
            default_role,
        }
    }

    pub fn allow_cross_tenant_access(&self) -> bool {
        self.allow_cross_tenant_access
    }
    pub fn require_reviewer_for_publish(&self) -> bool {
        self.require_reviewer_for_publish
    }
    pub fn default_role(&self) -> &Option<RoleId> {
        &self.default_role
    }
}
