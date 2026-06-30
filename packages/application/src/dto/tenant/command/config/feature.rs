use domain::tenant::config::feature::{Feature, FeatureRolloutPolicy};

#[derive(Debug, Clone)]
pub struct TenantFeatureConfigCommand {
    pub enabled_features: Option<Vec<Feature>>,
    pub limits: Option<FeatureLimitsCommand>,
    pub rollout: Option<FeatureRolloutPolicy>,
}

#[derive(Debug, Clone)]
pub struct FeatureLimitsCommand {
    pub max_projects: Option<u32>,
    pub max_users: Option<u32>,
    pub api_rate_limit: Option<u32>,
}
