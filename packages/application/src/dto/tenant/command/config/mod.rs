use authorization::TenantAuthorizationConfigCommand;
use collaboration::TenantCollaborationConfigCommand;
use environment::TenantEnvironmentConfigCommand;
use feature::TenantFeatureConfigCommand;

pub mod authorization;
pub mod collaboration;
pub mod environment;
pub mod feature;

#[derive(Debug, Clone)]
pub struct TenantConfigCommand {
    pub authorization: Option<TenantAuthorizationConfigCommand>,
    pub environment: Option<TenantEnvironmentConfigCommand>,
    pub collaboration: Option<TenantCollaborationConfigCommand>,
    pub features: Option<TenantFeatureConfigCommand>,
}
