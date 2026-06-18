mod support;

use domain::membership::fields::MembershipField;
use domain::permissions::fields::PermissionField;
use domain::tenant::config::environment::TenantEnvironmentConfig;
use domain::tenant::environment::{
    device_security_posture::DeviceSecurityPosture,
    network_information::{ConnectionType, NetworkInformation},
    risk_signals::{AuthenticationStrength, RiskSignals},
};
use domain::traits::field::Field;
use domain::user::fields::{UserField, UserProfileField};
use domain::value_objects::{NetworkZone, TimeWindow};
use domain::{DomainError};

#[test]
fn membership_and_permission_field_names() {
    assert_eq!(MembershipField::TenantId.name(), "tenant_id");
    assert_eq!(PermissionField::CreatedAt.name(), "created_at");
    assert_eq!(UserProfileField::Addresses.name(), "addresses");
    assert_eq!(UserField::Version.name(), "version");
}

#[test]
fn risk_signals_threshold_helpers() {
    use domain::tenant::environment::risk_signals::RiskSignals;
    use domain::tenant::environment::risk_signals::AuthenticationStrength;

    let low = RiskSignals::new(10, AuthenticationStrength::MultiFactor, 1);
    let high = RiskSignals::new(90, AuthenticationStrength::PasswordOnly, 50);

    assert!(!low.exceeds_threshold(80));
    assert!(!low.is_high_risk(80));
    assert!(high.exceeds_threshold(80));
    assert!(high.is_high_risk(80));
    assert!(!high.exceeds_threshold(90));
}

#[test]
fn tenant_environment_config_evaluate_accepts_compliant_context() {
    let config = TenantEnvironmentConfig::new(
        None,
        &[NetworkZone::TrustedCorporate],
        true,
        Some(80),
    );
    assert!(config.evaluate(&support::sample_environment()).is_ok());
}

#[test]
fn tenant_environment_config_skips_network_check_when_allowed_list_empty() {
    let config = TenantEnvironmentConfig::new(None, &[], false, None);
    assert!(config.evaluate(&support::sample_environment()).is_ok());
}

#[test]
fn tenant_environment_config_rejects_unmanaged_device() {
    let config = TenantEnvironmentConfig::new(None, &[], true, None);
    let mut env = support::sample_environment();
    env = domain::tenant::environment::Environment::new(
        env.time().clone(),
        env.location().clone(),
        DeviceSecurityPosture::new(false, true, true),
        env.network().clone(),
        env.risk().clone(),
    );
    assert!(matches!(
        config.evaluate(&env),
        Err(DomainError::ValidationError(_))
    ));
}

#[test]
fn tenant_environment_config_rejects_high_risk() {
    let config = TenantEnvironmentConfig::new(None, &[], false, Some(20));
    let sample = support::sample_environment();
    let env = domain::tenant::environment::Environment::new(
        sample.time().clone(),
        sample.location().clone(),
        sample.device().clone(),
        sample.network().clone(),
        RiskSignals::new(90, AuthenticationStrength::PasswordOnly, 10),
    );
    assert!(env.risk().is_high_risk(20));
    assert!(matches!(
        config.evaluate(&env),
        Err(DomainError::ValidationError(_))
    ));
}

#[test]
fn tenant_environment_config_rejects_disallowed_network() {
    let config = TenantEnvironmentConfig::new(
        None,
        &[NetworkZone::HighRisk],
        false,
        None,
    );
    assert!(matches!(
        config.evaluate(&support::sample_environment()),
        Err(DomainError::ValidationError(_))
    ));
}

#[test]
fn tenant_environment_config_rejects_outside_time_window() {
    let window = TimeWindow::Absolute {
        start: support::ts(100),
        end: support::ts(200),
    };
    let config = TenantEnvironmentConfig::new(Some(window), &[], false, None);
    let env = domain::tenant::environment::Environment::new(
        domain::tenant::environment::datetime::EnvironmentTime::new(
            support::ts(50),
            false,
        ),
        support::sample_environment().location().clone(),
        support::sample_environment().device().clone(),
        NetworkInformation::new(false, true, ConnectionType::CorporateNetwork),
        support::sample_environment().risk().clone(),
    );
    assert!(matches!(
        config.evaluate(&env),
        Err(DomainError::ValidationError(_))
    ));
}

#[test]
fn tenant_environment_config_evaluate_recurring_business_hours() {
    use domain::value_objects::date_time::Weekday;

    let business_hours = TimeWindow::Recurring {
        days: vec![Weekday::Monday, Weekday::Tuesday],
        start_seconds: 9 * 3600,
        end_seconds: 17 * 3600,
    };
    let config = TenantEnvironmentConfig::new(Some(business_hours), &[], false, None);
    let sample = support::sample_environment();

    let monday_morning = domain::tenant::environment::Environment::new(
        domain::tenant::environment::datetime::EnvironmentTime::new(
            domain::DateTime::new(4 * 86_400 + 10 * 3600),
            true,
        ),
        sample.location().clone(),
        sample.device().clone(),
        sample.network().clone(),
        sample.risk().clone(),
    );
    assert!(config.evaluate(&monday_morning).is_ok());

    let monday_early = domain::tenant::environment::Environment::new(
        domain::tenant::environment::datetime::EnvironmentTime::new(
            domain::DateTime::new(4 * 86_400 + 8 * 3600),
            false,
        ),
        sample.location().clone(),
        sample.device().clone(),
        sample.network().clone(),
        sample.risk().clone(),
    );
    assert!(matches!(
        config.evaluate(&monday_early),
        Err(DomainError::ValidationError(_))
    ));
}
