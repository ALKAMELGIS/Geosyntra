mod support;

use domain::specifications::permissions::HasPermission;
use domain::tenant::environment::network_information::ConnectionType;
use domain::tenant::environment::{
    datetime::EnvironmentTime,
    device_security_posture::DeviceSecurityPosture,
    location::{EnvironmentLocation, LocationZone},
    network_information::NetworkInformation,
    risk_signals::{AuthenticationStrength, RiskSignals},
    Environment,
};
use domain::traits::field::Field;
use domain::user::fields::{UserField, UserProfileField};
use domain::traits::specification::OrSpecification;
use domain::{
    Action, AndSpecification, DomainEvent, DomainEventId, Event, Resource, RoleId, Specification,
    Table, TemporaryGrant, UserId,
};
use std::collections::HashSet;

#[test]
fn has_permission_spec_on_role_and_grant() {
    let read = support::sample_permission("p1", "users", "read");
    let role = support::sample_role("admin", HashSet::from([read]));

    let spec = HasPermission {
        resource: Resource::new("users").unwrap(),
        action: Action::new("read").unwrap(),
    };
    assert!(spec.is_satisfied_by(&role));
    assert!(!HasPermission {
        resource: Resource::new("users").unwrap(),
        action: Action::new("delete").unwrap(),
    }
    .is_satisfied_by(&role));

    let grant = TemporaryGrant::new(
        UserId::new("u1"),
        domain::Description::new("temp").unwrap(),
        HashSet::from([support::sample_permission("p2", "users", "read")]),
        support::ts(200),
        support::ts(100),
        1,
    );
    assert!(spec.is_satisfied_by(&grant));
}

#[test]
fn specification_and_or_composition() {
    let role = support::sample_role(
        "admin",
        HashSet::from([support::sample_permission("p1", "users", "read")]),
    );

    let read_users = HasPermission {
        resource: Resource::new("users").unwrap(),
        action: Action::new("read").unwrap(),
    };
    let write_users = HasPermission {
        resource: Resource::new("users").unwrap(),
        action: Action::new("write").unwrap(),
    };

    let and = AndSpecification::new(read_users, write_users);
    assert!(!Specification::is_satisfied_by(&and, &role));

    let or = OrSpecification::new(
        HasPermission {
            resource: Resource::new("users").unwrap(),
            action: Action::new("read").unwrap(),
        },
        HasPermission {
            resource: Resource::new("users").unwrap(),
            action: Action::new("write").unwrap(),
        },
    );
    assert!(Specification::is_satisfied_by(&or, &role));
}

#[test]
fn domain_event_metadata_and_entity_snapshots() {
    let before = support::sample_user("u1");
    let mut after_builder = domain::User::new(UserId::new("u1"));
    after_builder
        .set_email(domain::Email::new("changed@example.com").unwrap())
        .set_username(domain::Username::new("john_doe").unwrap())
        .set_profile(support::sample_profile())
        .set_status(domain::user::UserStatus::Active);
    let after = after_builder.build().unwrap();

    let event = DomainEvent::new(
        "evt-1",
        Table::User,
        "update".into(),
        UserId::new("actor"),
        support::ts(1),
        before,
        after,
    );

    assert_eq!(event.id().as_str(), "evt-1");
    assert_eq!(event.action(), "update");
    assert!(matches!(event.table(), Table::User));
    assert_eq!(event.user_id().as_str(), "actor");
    assert_eq!(event.before().email().email(), "john@example.com");
    assert_eq!(event.after().email().email(), "changed@example.com");
    assert_eq!(DomainEventId::new("x").as_str(), "x");
}

#[test]
fn event_type_strings_for_non_report_entities() {
    assert_eq!(Event::get_type(&support::sample_user("u1")), "USER");
    assert_eq!(Event::get_type(&support::sample_tenant("t1")), "TENANT");
    assert_eq!(
        Event::get_type(&support::sample_role("r1", HashSet::new())),
        "ROLE"
    );
    assert_eq!(
        Event::get_type(&support::sample_permission("p1", "users", "read")),
        "PERMISSION"
    );
}

#[test]
fn user_field_names_for_projection() {
    assert_eq!(UserField::Email.name(), "email");
    assert_eq!(UserField::Profile(UserProfileField::FirstName).name(), "profile");
    assert_eq!(UserProfileField::UpdatedAt.name(), "updated_at");
}

#[test]
fn environment_components_reflect_request_context() {
    let env = support::sample_environment();
    assert!(env.time().is_business_hours());
    assert!(env.device().is_managed());
    assert!(env.device().is_compliant());
    assert!(env.network().is_corporate_ip());
    assert!(env.network().is_vpn());
    assert!(!env.network().is_public_network());
    assert_eq!(env.risk().score(), &25);
    assert!(matches!(
        env.risk().authentication_strength(),
        &AuthenticationStrength::MultiFactor
    ));
}

#[test]
fn environment_network_connection_types() {
    let public = NetworkInformation::new(false, false, ConnectionType::PublicWifi);
    assert!(public.is_public_network());
    assert!(!public.is_corporate_ip());

    let cellular = NetworkInformation::new(false, true, ConnectionType::Cellular);
    assert!(cellular.is_cellular_network());
}

#[test]
fn environment_location_zones() {
    let internal = EnvironmentLocation::new(LocationZone::InternalNetwork);
    assert!(matches!(internal.zone(), LocationZone::InternalNetwork));

    let unknown = EnvironmentLocation::new(LocationZone::Unknown);
    assert!(matches!(unknown.zone(), LocationZone::Unknown));

    let _full = Environment::new(
        EnvironmentTime::new(support::ts(1), false),
        unknown,
        DeviceSecurityPosture::new(false, false, false),
        NetworkInformation::new(false, false, ConnectionType::Unknown),
        RiskSignals::new(90, AuthenticationStrength::PasswordOnly, 100),
    );
}

#[test]
fn role_id_as_str() {
    let id = RoleId::new("role-1");
    assert_eq!(id.as_str(), "role-1");
    assert_eq!(&*id, "role-1");
}
