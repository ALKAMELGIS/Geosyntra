use super::{
    rbac_mapping::map_use_case_to_domain,
    ApplicationAuthorizationPolicy,
};
use crate::authorization::{engine::AuthorizationContext, AccessDecision};

/// Bridges the authorization engine to [`SubjectContext`](crate::SubjectContext) role permissions.
pub struct RbacPermissionPolicy;

impl ApplicationAuthorizationPolicy for RbacPermissionPolicy {
    fn evaluate(&self, ctx: &AuthorizationContext) -> Option<AccessDecision> {
        let (resource, action) =
            map_use_case_to_domain(ctx.resource_type.as_str(), ctx.action.as_str()).ok()?;
        let now = ctx.environment.time().timestamp();
        if ctx
            .subject
            .has_permission(&resource, &action, now)
        {
            Some(AccessDecision::Allow)
        } else {
            Some(AccessDecision::Deny)
        }
    }
}

#[cfg(test)]
mod tests {
    use domain::{
        tenant::environment::{
            datetime::EnvironmentTime,
            device_security_posture::DeviceSecurityPosture,
            location::{EnvironmentLocation, LocationZone},
            network_information::{ConnectionType, NetworkInformation},
            risk_signals::{AuthenticationStrength, RiskSignals},
            Environment,
        },
        Action, DateTime, Description, Name, Permission, PermissionId, Resource, Role, RoleId,
        TenantId, UserId,
    };

    use super::*;
    use crate::{
        authorization::{
            action::AuthorizationAction,
            attributes::AuthorizationAttributes,
            engine::AuthorizationContext,
            relation::AuthorizationRelations,
            resource_type::AuthorizationResourceType,
            AccessDecision,
        },
        SubjectContext,
    };

    fn sample_environment() -> Environment {
        Environment::new(
            EnvironmentTime::new(DateTime::new(1), true),
            EnvironmentLocation::new(LocationZone::Unknown),
            DeviceSecurityPosture::new(true, true, true),
            NetworkInformation::new(false, true, ConnectionType::CorporateNetwork),
            RiskSignals::new(0, AuthenticationStrength::MultiFactor, 0),
        )
    }

    fn role_with_permission(resource: &str, action: &str) -> Role {
        let mut builder = Role::new(RoleId::new("admin"));
        builder
            .set_name(Name::new("Admin").unwrap())
            .set_description(Description::new("Admin").unwrap())
            .add_permission(Permission::new(
                PermissionId::new("p1"),
                Resource::new(resource).unwrap(),
                Action::new(action).unwrap(),
                Description::new("perm").unwrap(),
                DateTime::new(0),
                1,
            ))
            .set_is_system_role(true)
            .set_created_at(DateTime::new(0));
        builder.build().unwrap()
    }

    fn auth_ctx(subject: &SubjectContext) -> AuthorizationContext<'_> {
        AuthorizationContext {
            subject,
            action: AuthorizationAction::new("read"),
            resource_type: AuthorizationResourceType::new("user"),
            subject_attributes: AuthorizationAttributes::new(),
            resource_attributes: AuthorizationAttributes::new(),
            relations: AuthorizationRelations::new(),
            environment: sample_environment(),
        }
    }

    #[test]
    fn allows_when_subject_has_mapped_permission() {
        let subject = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[role_with_permission("admin_users", "read")],
            &[],
        );
        let ctx = auth_ctx(&subject);
        let decision = RbacPermissionPolicy.evaluate(&ctx).unwrap();
        assert!(matches!(decision, AccessDecision::Allow));
    }

    #[test]
    fn denies_when_subject_lacks_permission() {
        let subject = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[role_with_permission("aoi", "read")],
            &[],
        );
        let ctx = auth_ctx(&subject);
        let decision = RbacPermissionPolicy.evaluate(&ctx).unwrap();
        assert!(matches!(decision, AccessDecision::Deny));
    }
}
