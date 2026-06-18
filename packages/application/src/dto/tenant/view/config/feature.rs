use domain::tenant::config::feature::{Feature, FeatureRolloutPolicy};

#[derive(Debug, Clone)]
pub struct TenantFeatureConfigView {
    pub enabled_features: Option<Vec<Feature>>,
    pub limits: Option<FeatureLimitsView>,
    pub rollout: Option<FeatureRolloutPolicy>,
}

#[derive(Debug, Clone)]
pub struct FeatureLimitsView {
    pub max_projects: Option<u32>,
    pub max_users: Option<u32>,
    pub api_rate_limit: Option<u32>,
}
