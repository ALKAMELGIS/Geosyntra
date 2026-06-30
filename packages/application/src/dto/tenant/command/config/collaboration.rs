use domain::{
    tenant::config::collaboration::{
        CollaborationAccessLevel, CollaborationMode, FederationPolicy,
    },
    TenantId,
};

#[derive(Debug, Clone)]
pub struct TenantCollaborationConfigCommand {
    pub trusted_tenants: Option<Vec<TenantId>>,
    pub allowed_modes: Option<Vec<CollaborationMode>>,
    pub federation: Option<FederationPolicy>,
    pub access_level: Option<CollaborationAccessLevel>,
}
