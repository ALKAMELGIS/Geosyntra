use authorization::TenantAuthorizationConfig;
use collaboration::TenantCollaborationConfig;
use environment::TenantEnvironmentConfig;
use feature::TenantFeatureConfig;

pub mod authorization;
pub mod collaboration;
pub mod environment;
pub mod feature;
#[derive(Debug, Clone)]
pub struct TenantConfig {
    authorization: TenantAuthorizationConfig,
    environment: TenantEnvironmentConfig,
    collaboration: TenantCollaborationConfig,
    features: TenantFeatureConfig,
}

#[derive(Debug, Clone)]
pub struct TenantConfigParts {
    pub authorization: TenantAuthorizationConfig,
    pub environment: TenantEnvironmentConfig,
    pub collaboration: TenantCollaborationConfig,
    pub features: TenantFeatureConfig,
}

impl TenantConfig {
    pub fn new(
        authorization: TenantAuthorizationConfig,
        environment: TenantEnvironmentConfig,
        collaboration: TenantCollaborationConfig,
        features: TenantFeatureConfig,
    ) -> Self {
        Self {
            authorization,
            environment,
            collaboration,
            features,
        }
    }

    pub fn into_parts(self) -> TenantConfigParts {
        let Self {
            authorization,
            environment,
            collaboration,
            features,
        } = self;
        TenantConfigParts {
            authorization,
            environment,
            collaboration,
            features,
        }
    }

    pub fn authorization(&self) -> &TenantAuthorizationConfig {
        &self.authorization
    }
    pub fn environment(&self) -> &TenantEnvironmentConfig {
        &self.environment
    }
    pub fn collaboration(&self) -> &TenantCollaborationConfig {
        &self.collaboration
    }
    pub fn features(&self) -> &TenantFeatureConfig {
        &self.features
    }
}
