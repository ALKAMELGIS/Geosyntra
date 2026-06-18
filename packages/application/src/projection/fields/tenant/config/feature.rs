#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TenantFeatureConfigField {
    EnabledFeatures,
    Limits(FeatureLimitsField),
    Rollout,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FeatureLimitsField {
    MaxProjects,
    MaxUsers,
    ApiRateLimit,
}
