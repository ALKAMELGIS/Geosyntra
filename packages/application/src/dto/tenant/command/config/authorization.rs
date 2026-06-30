use domain::RoleId;

#[derive(Debug, Clone)]
pub struct TenantAuthorizationConfigCommand {
    pub allow_cross_tenant_access: Option<bool>,
    pub require_reviewer_for_publish: Option<bool>,
    pub default_role: Option<RoleId>,
}
