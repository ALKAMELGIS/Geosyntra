use crate::billing::{GeoFeature, Subscription, UsageRecord};
use crate::error::{BillingError, DomainResult};

/// Input for plan-gate evaluation — subscription + usage + requested GeoAI feature.
#[derive(Debug, Clone, Copy)]
pub struct PlanGateContext<'a> {
    pub subscription: &'a Subscription,
    pub usage: &'a UsageRecord,
    pub feature: GeoFeature,
    /// Current API calls in the tenant rate-limit window (required for [`GeoFeature::ApiAccess`]).
    pub api_calls_in_window: Option<u32>,
}

impl<'a> PlanGateContext<'a> {
    pub fn new(
        subscription: &'a Subscription,
        usage: &'a UsageRecord,
        feature: GeoFeature,
    ) -> Self {
        Self {
            subscription,
            usage,
            feature,
            api_calls_in_window: None,
        }
    }

    pub fn with_api_calls_in_window(mut self, calls: u32) -> Self {
        self.api_calls_in_window = Some(calls);
        self
    }
}

#[derive(Debug, Clone)]
pub struct TenantFeatureConfig {
    enabled_features: Vec<Feature>,
    limits: FeatureLimits,
    rollout: FeatureRolloutPolicy,
}

#[derive(Debug, Clone)]
pub struct TenantFeatureConfigParts {
    pub enabled_features: Vec<Feature>,
    pub limits: FeatureLimits,
    pub rollout: FeatureRolloutPolicy,
}

impl TenantFeatureConfig {
    pub fn new(
        enabled_features: Vec<Feature>,
        limits: FeatureLimits,
        rollout: FeatureRolloutPolicy,
    ) -> Self {
        Self {
            enabled_features,
            limits,
            rollout,
        }
    }

    pub fn into_parts(self) -> TenantFeatureConfigParts {
        let Self {
            enabled_features,
            limits,
            rollout,
        } = self;
        TenantFeatureConfigParts {
            enabled_features,
            limits,
            rollout,
        }
    }

    // Getters

    pub fn enabled_features(&self) -> &Vec<Feature> {
        &self.enabled_features
    }
    pub fn limits(&self) -> &FeatureLimits {
        &self.limits
    }
    pub fn rollout(&self) -> &FeatureRolloutPolicy {
        &self.rollout
    }
    pub fn is_enabled(&self, feature: Feature) -> bool {
        self.enabled_features.contains(&feature)
    }

    /// Evaluates tenant flags, subscription plan gates, and tenant API rate limits.
    ///
    /// Subscription tier and daily quotas mirror Express [`checkPlan.js`](Geosyntra/backend/server/billing/checkPlan.js).
    /// Tenant [`Feature`] flags and [`FeatureLimits::api_rate_limit`] apply after subscription gates succeed.
    pub fn evaluate(&self, ctx: &PlanGateContext<'_>) -> DomainResult<()> {
        if let Some(tenant_feature) = required_tenant_feature(ctx.feature)
            && !self.is_enabled(tenant_feature)
        {
            return Err(BillingError::TenantFeatureDisabled {
                feature: ctx.feature,
            }
            .into());
        }

        ctx.subscription.gate_feature(ctx.feature, ctx.usage)?;

        if ctx.feature == GeoFeature::ApiAccess
            && let Some(calls) = ctx.api_calls_in_window
        {
            let limit = *self.limits().api_rate_limit();
            if calls >= limit {
                return Err(BillingError::ApiRateLimitExceeded {
                    used: calls,
                    limit,
                }
                .into());
            }
        }

        Ok(())
    }
}

/// Maps billing [`GeoFeature`] gates to tenant-level [`Feature`] flags when applicable.
fn required_tenant_feature(feature: GeoFeature) -> Option<Feature> {
    match feature {
        GeoFeature::ApiAccess => Some(Feature::ApiAccess),
        GeoFeature::AdvancedAnalytics => Some(Feature::AdvancedReports),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Feature {
    AdvancedReports,
    CrossTenantSharing,
    AuditLogs,
    ApiAccess,
    RiskScoring,
    BetaDashboard,
}
#[derive(Debug, Clone)]
pub struct FeatureLimits {
    max_projects: u32,
    max_users: u32,
    api_rate_limit: u32,
}

#[derive(Debug, Clone)]
pub struct FeatureLimitsParts {
    pub max_projects: u32,
    pub max_users: u32,
    pub api_rate_limit: u32,
}

impl FeatureLimits {
    pub fn new(max_projects: u32, max_users: u32, api_rate_limit: u32) -> Self {
        Self {
            max_projects,
            max_users,
            api_rate_limit,
        }
    }

    pub fn into_parts(self) -> FeatureLimitsParts {
        let FeatureLimits {
            max_projects,
            max_users,
            api_rate_limit,
        } = self;
        FeatureLimitsParts {
            max_projects,
            max_users,
            api_rate_limit,
        }
    }

    pub fn max_projects(&self) -> &u32 {
        &self.max_projects
    }
    pub fn max_users(&self) -> &u32 {
        &self.max_users
    }
    pub fn api_rate_limit(&self) -> &u32 {
        &self.api_rate_limit
    }
}

#[derive(Debug, Clone, Copy)]
pub enum FeatureRolloutPolicy {
    Stable,
    Beta,
    Canary,
}
