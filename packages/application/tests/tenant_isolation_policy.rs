use application::{
    authorization::{
        guard::tenant::TenantIsolationPolicy,
        neutral_environment,
        AccessDecision,
        action::AuthorizationAction,
        attributes::{AttributeKey, AttributeValue, AuthorizationAttributes},
        engine::AuthorizationContext,
        policys::ApplicationAuthorizationPolicy,
        relation::AuthorizationRelations,
        resource_type::AuthorizationResourceType,
    },
    SubjectContext,
};
use domain::TenantId;

#[test]
fn tenant_isolation_denies_cross_tenant_resource() {
    let subject = SubjectContext::new(
        domain::UserId::new("u1"),
        TenantId::new("tenant-a"),
        &[],
        &[],
    );
    let mut resource_attributes = AuthorizationAttributes::new();
    resource_attributes.add_attribute((
        AttributeKey::new("tenant_id"),
        AttributeValue::String("tenant-b".to_string()),
    ));
    let ctx = AuthorizationContext {
        subject: &subject,
        action: AuthorizationAction::new("read"),
        resource_type: AuthorizationResourceType::new("user"),
        subject_attributes: AuthorizationAttributes::new(),
        resource_attributes,
        relations: AuthorizationRelations::new(),
        environment: neutral_environment(),
    };
    let decision = TenantIsolationPolicy.evaluate(&ctx).unwrap();
    assert!(matches!(decision, AccessDecision::Deny));
}

#[test]
fn tenant_isolation_passes_when_resource_tenant_matches() {
    let subject = SubjectContext::new(
        domain::UserId::new("u1"),
        TenantId::new("tenant-a"),
        &[],
        &[],
    );
    let mut resource_attributes = AuthorizationAttributes::new();
    resource_attributes.add_attribute((
        AttributeKey::new("tenant_id"),
        AttributeValue::String("tenant-a".to_string()),
    ));
    let ctx = AuthorizationContext {
        subject: &subject,
        action: AuthorizationAction::new("read"),
        resource_type: AuthorizationResourceType::new("user"),
        subject_attributes: AuthorizationAttributes::new(),
        resource_attributes,
        relations: AuthorizationRelations::new(),
        environment: neutral_environment(),
    };
    assert!(TenantIsolationPolicy.evaluate(&ctx).is_none());
}

#[test]
fn tenant_isolation_passes_when_resource_has_no_tenant_attribute() {
    let subject = SubjectContext::new(
        domain::UserId::new("u1"),
        TenantId::new("tenant-a"),
        &[],
        &[],
    );
    let ctx = AuthorizationContext {
        subject: &subject,
        action: AuthorizationAction::new("read"),
        resource_type: AuthorizationResourceType::new("user"),
        subject_attributes: AuthorizationAttributes::new(),
        resource_attributes: AuthorizationAttributes::new(),
        relations: AuthorizationRelations::new(),
        environment: neutral_environment(),
    };
    assert!(TenantIsolationPolicy.evaluate(&ctx).is_none());
}
