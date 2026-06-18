#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TenantCollaborationConfigField {
    TrustedTenants,
    AllowedModes,
    Federation,
    AccessLevel,
}
