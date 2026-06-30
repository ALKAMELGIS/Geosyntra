mod support;

use domain::membership::Membership;
use domain::tenant::config::feature::Feature;
use domain::tenant::config::{
    authorization::TenantAuthorizationConfig,
    collaboration::{CollaborationAccessLevel, CollaborationMode, FederationPolicy},
    environment::TenantEnvironmentConfig,
    feature::{FeatureLimits, FeatureRolloutPolicy, TenantFeatureConfig},
    TenantConfig,
};
use domain::value_objects::{NetworkZone, TimeWindow};
use domain::{Event, RoleId, TenantId, UserId};
use std::collections::HashSet;

#[test]
fn membership_tracks_roles_and_tenant() {
    let membership = Membership::new(
        UserId::new("u1"),
        TenantId::new("t1"),
        HashSet::from([RoleId::new("admin"), RoleId::new("viewer")]),
        support::ts(1),
        2,
    );

    assert!(membership.has_role(&RoleId::new("admin")));
    assert!(!membership.has_role(&RoleId::new("owner")));
    assert_eq!(membership.tenant_id().as_str(), "t1");
    assert_eq!(membership.version(), &2);
    assert_eq!(Event::get_type(&membership), "MEMBERSHIP");

    let parts = membership.into_parts();
    assert_eq!(parts.roles.len(), 2);
}

#[test]
fn membership_roles_hashset_deduplicates() {
    let role = RoleId::new("admin");
    let membership = Membership::new(
        UserId::new("u1"),
        TenantId::new("t1"),
        HashSet::from([role.clone(), role]),
        support::ts(1),
        1,
    );
    assert_eq!(membership.roles().len(), 1);
}

#[test]
fn tenant_config_submodules_expose_settings() {
    let config = support::default_tenant_config();

    assert!(!config.authorization().allow_cross_tenant_access());
    assert!(config.authorization().require_reviewer_for_publish());
    assert_eq!(
        config.authorization().default_role().as_ref().unwrap().as_str(),
        "member"
    );

    assert!(config.environment().allowed_time_window().is_none());
    assert!(config.environment().allowed_networks().is_empty());
    assert!(!config.environment().require_managed_device());
    assert_eq!(config.environment().max_risk_score(), &Some(80));

    assert_eq!(config.collaboration().trusted_tenants().len(), 1);
    assert!(config
        .collaboration()
        .allowed_modes()
        .contains(&CollaborationMode::GuestAccess));
    assert_eq!(
        config.collaboration().federation(),
        &FederationPolicy::VerifiedOnly
    );
    assert_eq!(
        config.collaboration().access_level(),
        &CollaborationAccessLevel::Contributor
    );

    assert!(config.features().is_enabled(Feature::ApiAccess));
    assert!(!config.features().is_enabled(Feature::BetaDashboard));
    assert_eq!(config.features().limits().max_users(), &100);
}

#[test]
fn tenant_config_into_parts_roundtrip() {
    let config = support::default_tenant_config();
    let parts = config.into_parts();
    assert_eq!(parts.features.enabled_features().len(), 2);
}

#[test]
fn tenant_aggregate_and_event_type() {
    let tenant = support::sample_tenant("geosyntra-default");
    assert_eq!(tenant.id().as_str(), "geosyntra-default");
    assert_eq!(tenant.name().name(), "GeoSyntra");
    assert_eq!(tenant.version(), &1);
    assert!(tenant.config().features().is_enabled(Feature::AuditLogs));
    assert_eq!(Event::get_type(&tenant), "TENANT");

    let parts = tenant.into_parts();
    assert_eq!(parts.version, 1);
}

#[test]
fn tenant_environment_config_with_time_window_and_networks() {
    let window = TimeWindow::Absolute {
        start: support::ts(100),
        end: support::ts(200),
    };
    let env = TenantEnvironmentConfig::new(
        Some(window),
        &[NetworkZone::TrustedCorporate, NetworkZone::Internal],
        true,
        Some(50),
    );
    let config = TenantConfig::new(
        TenantAuthorizationConfig::new(true, false, None),
        env,
        support::default_tenant_config().into_parts().collaboration,
        TenantFeatureConfig::new(
            vec![],
            FeatureLimits::new(1, 1, 1),
            FeatureRolloutPolicy::Beta,
        ),
    );
    assert!(config.environment().require_managed_device());
    assert_eq!(config.environment().allowed_networks().len(), 2);
    assert!(matches!(
        config.features().rollout(),
        FeatureRolloutPolicy::Beta
    ));
}
