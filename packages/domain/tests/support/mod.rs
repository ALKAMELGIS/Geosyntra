//! Shared fixtures for domain integration tests (Report excluded).

#![allow(dead_code)]

use domain::tenant::config::{
    authorization::TenantAuthorizationConfig,
    collaboration::{
        CollaborationAccessLevel, CollaborationMode, FederationPolicy, TenantCollaborationConfig,
    },
    environment::TenantEnvironmentConfig,
    feature::{Feature, FeatureLimits, FeatureRolloutPolicy, TenantFeatureConfig},
    TenantConfig,
};
use domain::tenant::environment::{
    datetime::EnvironmentTime,
    device_security_posture::DeviceSecurityPosture,
    location::{EnvironmentLocation, LocationZone},
    network_information::{ConnectionType, NetworkInformation},
    risk_signals::{AuthenticationStrength, RiskSignals},
    Environment,
};
use domain::user::UserStatus;
use domain::value_objects::password::NoneHashedPassword;
use domain::value_objects::Country;
use domain::{
    Action, DateTime, Description, Email, Name, Password, Permission, PermissionId, Resource, Role,
    RoleId, Tenant, TenantId, User, UserId, UserProfile, Username,
};
use std::collections::HashSet;

pub fn ts(n: i64) -> DateTime {
    DateTime::new(n)
}

pub fn sample_profile() -> UserProfile {
    let now = ts(1_700_000_000);
    let mut builder = UserProfile::new();
    builder
        .set_first_name(Name::new("John").unwrap())
        .set_last_name(Name::new("Doe").unwrap())
        .set_password(Password::NoneHashed(
            NoneHashedPassword::new("password123").unwrap(),
        ))
        .set_date_of_birth(now);
    builder.build(now, now).unwrap()
}

pub fn sample_user(id: &str) -> User {
    let mut builder = User::new(UserId::new(id));
    builder
        .set_email(Email::new("john@example.com").unwrap())
        .set_username(Username::new("john_doe").unwrap())
        .set_profile(sample_profile())
        .set_status(UserStatus::Active);
    builder.build().unwrap()
}

pub fn sample_permission(id: &str, resource: &str, action: &str) -> Permission {
    Permission::new(
        PermissionId::new(id),
        Resource::new(resource).unwrap(),
        Action::new(action).unwrap(),
        Description::new("Permission for tests").unwrap(),
        ts(1),
        1,
    )
}

pub fn sample_role(id: &str, permissions: HashSet<Permission>) -> Role {
    let mut builder = Role::new(RoleId::new(id));
    builder
        .set_name(Name::new("Admin").unwrap())
        .set_description(Description::new("Administrator role").unwrap())
        .set_is_system_role(true)
        .set_created_at(ts(1));
    for p in permissions {
        builder.add_permission(p);
    }
    builder.build().unwrap()
}

pub fn default_tenant_config() -> TenantConfig {
    TenantConfig::new(
        TenantAuthorizationConfig::new(false, true, Some(RoleId::new("member"))),
        TenantEnvironmentConfig::new(None, &[], false, Some(80)),
        TenantCollaborationConfig::new(
            vec![TenantId::new("trusted-tenant")],
            vec![CollaborationMode::GuestAccess, CollaborationMode::ResourceSharing],
            FederationPolicy::VerifiedOnly,
            CollaborationAccessLevel::Contributor,
        ),
        TenantFeatureConfig::new(
            vec![Feature::ApiAccess, Feature::AuditLogs],
            FeatureLimits::new(10, 100, 1_000),
            FeatureRolloutPolicy::Stable,
        ),
    )
}

pub fn sample_tenant(id: &str) -> Tenant {
    Tenant::new(
        TenantId::new(id),
        Name::new("GeoSyntra").unwrap(),
        Description::new("Default workspace").unwrap(),
        ts(1),
        default_tenant_config(),
        1,
    )
}

pub fn sample_environment() -> Environment {
    Environment::new(
        EnvironmentTime::new(ts(1_700_000_000), true),
        EnvironmentLocation::new(LocationZone::Country(
            Country::new("United States").unwrap(),
        )),
        DeviceSecurityPosture::new(true, true, true),
        NetworkInformation::new(true, true, ConnectionType::CorporateNetwork),
        RiskSignals::new(25, AuthenticationStrength::MultiFactor, 3),
    )
}

/// Valid bcrypt-shaped hash (60 chars) for HashedPassword tests.
pub fn valid_bcrypt_hash() -> &'static str {
    "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
}
