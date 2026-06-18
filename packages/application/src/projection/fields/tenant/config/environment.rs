#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TenantEnvironmentConfigField {
    AllowedTimeWindow,
    AllowedNetworks,
    RequireManagedDevice,
    MaxRiskScore,
}
