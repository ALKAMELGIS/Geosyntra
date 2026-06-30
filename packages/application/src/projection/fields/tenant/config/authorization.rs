#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TenantAuthorizationConfigField {
    AllowCrossTenantAccess,
    RequireReviewerForPublish,
    DefaultRole,
}
