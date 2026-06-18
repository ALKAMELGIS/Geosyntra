use crate::error::{BillingError, DomainResult};
use crate::user::UserId;
use crate::Event;

use super::plan::{BillingPlan, GeoFeature, PlanLimits};
use super::usage::UsageRecord;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubscriptionStatus {
    Active,
    Trialing,
    PastDue,
    Cancelled,
    Unpaid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SubscriptionDisplayStatus {
    #[default]
    Active,
    TrialExpired,
    PaymentPending,
}

/// User subscription aggregate — immutable; plan changes via application commands.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subscription {
    user_id: Option<UserId>,
    plan: BillingPlan,
    status: SubscriptionStatus,
    display_status: SubscriptionDisplayStatus,
    limits: PlanLimits,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubscriptionParts {
    pub user_id: Option<UserId>,
    pub plan: BillingPlan,
    pub status: SubscriptionStatus,
    pub display_status: SubscriptionDisplayStatus,
    pub limits: PlanLimits,
}

impl Subscription {
    pub fn new(
        user_id: Option<UserId>,
        plan: BillingPlan,
        status: SubscriptionStatus,
        display_status: SubscriptionDisplayStatus,
        limits: PlanLimits,
    ) -> Self {
        Self {
            user_id,
            plan,
            status,
            display_status,
            limits,
        }
    }

    pub fn anonymous_free() -> Self {
        Self::new(
            None,
            BillingPlan::Free,
            SubscriptionStatus::Active,
            SubscriptionDisplayStatus::Active,
            BillingPlan::Free.default_limits(),
        )
    }

    pub fn for_user(user_id: UserId, plan: BillingPlan, status: SubscriptionStatus) -> Self {
        Self::new(
            Some(user_id),
            plan,
            status,
            SubscriptionDisplayStatus::Active,
            plan.default_limits(),
        )
    }

    pub fn into_parts(self) -> SubscriptionParts {
        let Self {
            user_id,
            plan,
            status,
            display_status,
            limits,
        } = self;
        SubscriptionParts {
            user_id,
            plan,
            status,
            display_status,
            limits,
        }
    }

    pub fn user_id(&self) -> Option<&UserId> {
        self.user_id.as_ref()
    }

    pub fn plan(&self) -> BillingPlan {
        self.plan
    }

    pub fn status(&self) -> SubscriptionStatus {
        self.status
    }

    pub fn display_status(&self) -> SubscriptionDisplayStatus {
        self.display_status
    }

    pub fn limits(&self) -> &PlanLimits {
        &self.limits
    }

    fn needs_upgrade(&self, feature: GeoFeature) -> bool {
        !BillingPlan::Free.allows_feature(feature) && !self.plan.allows_feature(feature)
    }

    /// Plan gate — mirrors Express [`checkPlan.js`](Geosyntra/backend/server/billing/checkPlan.js).
    pub fn gate_feature(&self, feature: GeoFeature, usage: &UsageRecord) -> DomainResult<()> {
        let needs_upgrade = self.needs_upgrade(feature);

        if self.display_status == SubscriptionDisplayStatus::TrialExpired && needs_upgrade {
            return Err(BillingError::TrialExpired {
                plan: self.plan,
                feature,
            }
            .into());
        }

        if self.display_status == SubscriptionDisplayStatus::PaymentPending && needs_upgrade {
            return Err(BillingError::PaymentPending {
                plan: self.plan,
                feature,
            }
            .into());
        }

        if !matches!(
            self.status,
            SubscriptionStatus::Active | SubscriptionStatus::Trialing
        ) && needs_upgrade
        {
            return Err(BillingError::SubscriptionInactive {
                plan: self.plan,
                feature,
            }
            .into());
        }

        if !self.plan.allows_feature(feature) {
            return Err(BillingError::UpgradeRequired {
                plan: self.plan,
                feature,
            }
            .into());
        }

        if feature == GeoFeature::AiQuery && self.plan == BillingPlan::Free {
            let limit = self.limits.ai_queries_per_day();
            let used = usage.ai_queries();
            if used >= limit {
                return Err(BillingError::QuotaExceeded {
                    plan: self.plan,
                    feature,
                    used,
                    limit,
                }
                .into());
            }
        }

        Ok(())
    }
}

impl Event for Subscription {
    fn get_type(&self) -> &str {
        "SUBSCRIPTION"
    }
}
