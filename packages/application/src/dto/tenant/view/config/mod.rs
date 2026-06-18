use authorization::TenantAuthorizationConfigView;
use collaboration::TenantCollaborationConfigView;
use environment::TenantEnvironmentConfigView;
use feature::TenantFeatureConfigView;

pub mod authorization;
pub mod collaboration;
pub mod environment;
pub mod feature;

#[derive(Debug, Clone)]
pub struct TenantConfigView {
    pub authorization: Option<TenantAuthorizationConfigView>,
    pub environment: Option<TenantEnvironmentConfigView>,
    pub collaboration: Option<TenantCollaborationConfigView>,
    pub features: Option<TenantFeatureConfigView>,
}
