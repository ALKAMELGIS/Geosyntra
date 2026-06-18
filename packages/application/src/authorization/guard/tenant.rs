use domain::TenantId;

use crate::authorization::{
    attributes::{AttributeKey, AttributeValue},
    engine::AuthorizationContext,
    policys::ApplicationAuthorizationPolicy,
    AccessDecision,
};

pub struct TenantIsolationPolicy;

impl ApplicationAuthorizationPolicy for TenantIsolationPolicy {
    fn evaluate(&self, ctx: &AuthorizationContext) -> Option<AccessDecision> {
        let subject_tenant = ctx.subject.tenant_id();
        let resource_tenant = ctx.resource_attributes.get(&AttributeKey::new("tenant_id"));

        if let Some(AttributeValue::String(tenant_id)) = resource_tenant
            && TenantId::new(tenant_id) != *subject_tenant
        {
            return Some(AccessDecision::Deny);
        }

        None
    }
}
