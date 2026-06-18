use domain::billing::{
    BillingPlan, GeoFeature, PlanLimits, Subscription, SubscriptionDisplayStatus,
    SubscriptionStatus, UsageRecord,
};
use domain::error::BillingError;
use domain::tenant::config::feature::{FeatureRolloutPolicy, PlanGateContext, TenantFeatureConfig};
use domain::tenant::config::feature::{Feature, FeatureLimits};
use domain::{DomainError, UserId};

fn feature_config() -> TenantFeatureConfig {
    TenantFeatureConfig::new(
        vec![Feature::ApiAccess],
        FeatureLimits::new(10, 50, 1000),
        FeatureRolloutPolicy::Stable,
    )
}

fn free_subscription() -> Subscription {
    Subscription::new(
        Some(UserId::new("user-1")),
        BillingPlan::Free,
        SubscriptionStatus::Active,
        SubscriptionDisplayStatus::Active,
        PlanLimits::new(10),
    )
}

fn pro_subscription() -> Subscription {
    Subscription::for_user(UserId::new("user-1"), BillingPlan::Pro, SubscriptionStatus::Active)
}

#[test]
fn billing_plan_normalize_matches_express() {
    assert_eq!(BillingPlan::normalize("pro"), BillingPlan::Pro);
    assert_eq!(BillingPlan::normalize("trial_pro"), BillingPlan::Pro);
    assert_eq!(BillingPlan::normalize("enterprise"), BillingPlan::Enterprise);
    assert_eq!(BillingPlan::normalize("ent"), BillingPlan::Enterprise);
    assert_eq!(BillingPlan::normalize(""), BillingPlan::Free);
    assert_eq!(BillingPlan::normalize("unknown"), BillingPlan::Free);
}

#[test]
fn billing_plan_allows_features_like_express() {
    assert!(BillingPlan::Free.allows_feature(GeoFeature::MapView));
    assert!(BillingPlan::Free.allows_feature(GeoFeature::AiQuery));
    assert!(!BillingPlan::Free.allows_feature(GeoFeature::Export));

    assert!(BillingPlan::Pro.allows_feature(GeoFeature::Export));
    assert!(BillingPlan::Pro.allows_feature(GeoFeature::AiQuery));

    assert!(BillingPlan::Enterprise.allows_feature(GeoFeature::ApiAccess));
    assert!(BillingPlan::Enterprise.allows_feature(GeoFeature::CustomDatasets));
}

#[test]
fn subscription_gate_allows_free_ai_within_quota() {
    let sub = free_subscription();
    let usage = UsageRecord::new(5, 0, 0);
    assert!(sub.gate_feature(GeoFeature::AiQuery, &usage).is_ok());
}

#[test]
fn subscription_gate_rejects_free_ai_quota_exceeded() {
    let sub = free_subscription();
    let usage = UsageRecord::new(10, 0, 0);
    assert!(matches!(
        sub.gate_feature(GeoFeature::AiQuery, &usage),
        Err(DomainError::BillingError(BillingError::QuotaExceeded {
            used: 10,
            limit: 10,
            ..
        }))
    ));
}

#[test]
fn subscription_gate_rejects_export_on_free() {
    let sub = free_subscription();
    let usage = UsageRecord::zero();
    assert!(matches!(
        sub.gate_feature(GeoFeature::Export, &usage),
        Err(DomainError::BillingError(BillingError::UpgradeRequired {
            plan: BillingPlan::Free,
            feature: GeoFeature::Export,
        }))
    ));
}

#[test]
fn subscription_gate_allows_export_on_pro() {
    let sub = pro_subscription();
    let usage = UsageRecord::zero();
    assert!(sub.gate_feature(GeoFeature::Export, &usage).is_ok());
}

#[test]
fn subscription_gate_rejects_trial_expired_for_paid_feature() {
    let sub = Subscription::new(
        Some(UserId::new("user-1")),
        BillingPlan::Free,
        SubscriptionStatus::Active,
        SubscriptionDisplayStatus::TrialExpired,
        PlanLimits::new(10),
    );
    let usage = UsageRecord::zero();
    assert!(matches!(
        sub.gate_feature(GeoFeature::Export, &usage),
        Err(DomainError::BillingError(BillingError::TrialExpired { .. }))
    ));
}

#[test]
fn subscription_gate_allows_free_feature_when_trial_expired() {
    let sub = Subscription::new(
        Some(UserId::new("user-1")),
        BillingPlan::Free,
        SubscriptionStatus::Active,
        SubscriptionDisplayStatus::TrialExpired,
        PlanLimits::new(10),
    );
    let usage = UsageRecord::new(0, 0, 0);
    assert!(sub.gate_feature(GeoFeature::MapView, &usage).is_ok());
}

#[test]
fn subscription_gate_rejects_payment_pending_for_paid_feature() {
    let sub = Subscription::new(
        Some(UserId::new("user-1")),
        BillingPlan::Pro,
        SubscriptionStatus::Active,
        SubscriptionDisplayStatus::PaymentPending,
        BillingPlan::Pro.default_limits(),
    );
    let usage = UsageRecord::zero();
    // Enterprise-only feature while payment pending — mirrors Express needsUpgrade path.
    assert!(matches!(
        sub.gate_feature(GeoFeature::ApiAccess, &usage),
        Err(DomainError::BillingError(BillingError::PaymentPending { .. }))
    ));
}

#[test]
fn subscription_gate_rejects_inactive_subscription() {
    let sub = Subscription::new(
        Some(UserId::new("user-1")),
        BillingPlan::Pro,
        SubscriptionStatus::Cancelled,
        SubscriptionDisplayStatus::Active,
        BillingPlan::Pro.default_limits(),
    );
    let usage = UsageRecord::zero();
    assert!(matches!(
        sub.gate_feature(GeoFeature::ApiAccess, &usage),
        Err(DomainError::BillingError(BillingError::SubscriptionInactive { .. }))
    ));
}

#[test]
fn tenant_feature_config_evaluate_delegates_to_subscription() {
    let config = feature_config();
    let sub = free_subscription();
    let usage = UsageRecord::new(10, 0, 0);
    let ctx = PlanGateContext::new(&sub, &usage, GeoFeature::AiQuery);
    assert!(matches!(
        config.evaluate(&ctx),
        Err(DomainError::BillingError(BillingError::QuotaExceeded { .. }))
    ));
}

#[test]
fn tenant_feature_config_rejects_disabled_tenant_api_access() {
    let config = TenantFeatureConfig::new(
        vec![], // ApiAccess not enabled
        FeatureLimits::new(10, 50, 1000),
        FeatureRolloutPolicy::Stable,
    );
    let sub = Subscription::for_user(
        UserId::new("user-1"),
        BillingPlan::Enterprise,
        SubscriptionStatus::Active,
    );
    let usage = UsageRecord::zero();
    let ctx = PlanGateContext::new(&sub, &usage, GeoFeature::ApiAccess);
    assert!(matches!(
        config.evaluate(&ctx),
        Err(DomainError::BillingError(BillingError::TenantFeatureDisabled {
            feature: GeoFeature::ApiAccess,
        }))
    ));
}

#[test]
fn tenant_feature_config_enforces_api_rate_limit() {
    let config = feature_config();
    let sub = Subscription::for_user(
        UserId::new("user-1"),
        BillingPlan::Enterprise,
        SubscriptionStatus::Active,
    );
    let usage = UsageRecord::zero();
    let ctx = PlanGateContext::new(&sub, &usage, GeoFeature::ApiAccess).with_api_calls_in_window(1000);
    assert!(matches!(
        config.evaluate(&ctx),
        Err(DomainError::BillingError(BillingError::ApiRateLimitExceeded {
            used: 1000,
            limit: 1000,
        }))
    ));
}

#[test]
fn billing_aggregates_implement_event_trait() {
    use domain::Event;

    let sub = free_subscription();
    assert_eq!(sub.get_type(), "SUBSCRIPTION");
    assert_eq!(UsageRecord::zero().get_type(), "USAGE_RECORD");
}

#[test]
fn usage_record_increment_counters() {
    let usage = UsageRecord::zero();
    let after_ai = usage.increment(domain::UsageCounter::AiQueries);
    assert_eq!(after_ai.ai_queries(), 1);
    let after_export = after_ai.increment(domain::UsageCounter::Exports);
    assert_eq!(after_export.exports(), 1);
}
