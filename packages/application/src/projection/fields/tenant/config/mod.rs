use authorization::TenantAuthorizationConfigField;
use collaboration::TenantCollaborationConfigField;
use environment::TenantEnvironmentConfigField;
use feature::TenantFeatureConfigField;

pub mod authorization;
pub mod collaboration;
pub mod environment;
pub mod feature;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TenantConfigField {
    Authorization(TenantAuthorizationConfigField),
    Environment(TenantEnvironmentConfigField),
    Collaboration(TenantCollaborationConfigField),
    Features(TenantFeatureConfigField),
}
