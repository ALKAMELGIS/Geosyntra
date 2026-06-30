/// GeoAI subscription tiers — mirrors Express [`planDefinitions.js`](Geosyntra/backend/server/billing/planDefinitions.js).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum BillingPlan {
    #[default]
    Free,
    Pro,
    Enterprise,
}

/// Feature slugs checked by plan gates — mirrors Express `GEO_FEATURES`.
///
/// RBAC permission `ai.run` (domain resource `ai_chat` + action `run`) is enforced separately
/// in the application layer; billing [`GeoFeature::AiQuery`] gates subscription tier and daily quota only.
/// See [`migration/billing-rbac-bridge.md`](Geosyntra/migration/billing-rbac-bridge.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GeoFeature {
    MapView,
    PoiSearchBasic,
    PoiSearch,
    AiQuery,
    AoiAnalysis,
    LayerCompare,
    VoiceAi,
    Export,
    ApiAccess,
    TeamWorkspace,
    CustomDatasets,
    AdvancedAnalytics,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanLimits {
    ai_queries_per_day: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanLimitsParts {
    pub ai_queries_per_day: u32,
}

impl PlanLimits {
    pub fn new(ai_queries_per_day: u32) -> Self {
        Self {
            ai_queries_per_day,
        }
    }

    pub fn into_parts(self) -> PlanLimitsParts {
        let Self {
            ai_queries_per_day,
        } = self;
        PlanLimitsParts {
            ai_queries_per_day,
        }
    }

    pub fn ai_queries_per_day(&self) -> u32 {
        self.ai_queries_per_day
    }
}

impl BillingPlan {
    pub fn normalize(value: &str) -> Self {
        let raw = value.trim().to_ascii_lowercase();
        match raw.as_str() {
            "pro" | "trial_pro" => Self::Pro,
            "enterprise" | "ent" => Self::Enterprise,
            _ => Self::Free,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Free => "free",
            Self::Pro => "pro",
            Self::Enterprise => "enterprise",
        }
    }

    /// Mirrors Express `planAllowsFeature(plan, feature)`.
    pub fn allows_feature(self, feature: GeoFeature) -> bool {
        match self {
            Self::Enterprise => true,
            Self::Pro => PRO_FEATURES.contains(&feature),
            Self::Free => FREE_FEATURES.contains(&feature),
        }
    }

    pub fn default_limits(self) -> PlanLimits {
        match self {
            Self::Free => PlanLimits::new(10),
            Self::Pro => PlanLimits::new(9999),
            Self::Enterprise => PlanLimits::new(999_999),
        }
    }
}

const FREE_FEATURES: &[GeoFeature] = &[
    GeoFeature::MapView,
    GeoFeature::PoiSearchBasic,
    GeoFeature::AiQuery,
];

const PRO_FEATURES: &[GeoFeature] = &[
    GeoFeature::MapView,
    GeoFeature::PoiSearchBasic,
    GeoFeature::AiQuery,
    GeoFeature::PoiSearch,
    GeoFeature::AoiAnalysis,
    GeoFeature::LayerCompare,
    GeoFeature::VoiceAi,
    GeoFeature::Export,
];
