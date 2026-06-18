use crate::TenantId;

#[derive(Debug, Clone)]
pub struct TenantCollaborationConfig {
    trusted_tenants: Vec<TenantId>,
    allowed_modes: Vec<CollaborationMode>,
    federation: FederationPolicy,
    access_level: CollaborationAccessLevel,
}
#[derive(Debug, Clone)]
pub struct TenantCollaborationConfigParts {
    pub trusted_tenants: Vec<TenantId>,
    pub allowed_modes: Vec<CollaborationMode>,
    pub federation: FederationPolicy,
    pub access_level: CollaborationAccessLevel,
}

impl TenantCollaborationConfig {
    pub fn new(
        trusted_tenants: Vec<TenantId>,
        allowed_modes: Vec<CollaborationMode>,
        federation: FederationPolicy,
        access_level: CollaborationAccessLevel,
    ) -> Self {
        Self {
            trusted_tenants,
            allowed_modes,
            federation,
            access_level,
        }
    }

    pub fn into_parts(self) -> TenantCollaborationConfigParts {
        let Self {
            trusted_tenants,
            allowed_modes,
            federation,
            access_level,
        } = self;
        TenantCollaborationConfigParts {
            trusted_tenants,
            allowed_modes,
            federation,
            access_level,
        }
    }

    pub fn trusted_tenants(&self) -> &Vec<TenantId> {
        &self.trusted_tenants
    }
    pub fn allowed_modes(&self) -> &Vec<CollaborationMode> {
        &self.allowed_modes
    }
    pub fn federation(&self) -> &FederationPolicy {
        &self.federation
    }
    pub fn access_level(&self) -> &CollaborationAccessLevel {
        &self.access_level
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollaborationMode {
    GuestAccess,
    ResourceSharing,
    ProjectCollaboration,
    FullFederation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollaborationAccessLevel {
    ReadOnly,
    Contributor,
    Admin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FederationPolicy {
    Disabled,
    VerifiedOnly,
    TrustedTenantsOnly,
}
