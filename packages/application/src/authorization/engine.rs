use domain::tenant::environment::Environment;

use crate::{usecases::usecase_descriptor::UseCaseDescriptor, SubjectContext};

use super::{
    action::AuthorizationAction,
    attributes::AuthorizationAttributes,
    guard::tenant::TenantIsolationPolicy,
    policys::{
        rbac_permission::RbacPermissionPolicy, ApplicationAuthorizationPolicy,
        ApplicationStoredPolicy,
    },
    relation::AuthorizationRelations,
    resource_type::AuthorizationResourceType,
    AccessDecision,
};

pub struct AuthorizationContext<'a> {
    pub subject: &'a SubjectContext,
    pub action: AuthorizationAction,

    pub resource_type: AuthorizationResourceType,

    pub subject_attributes: AuthorizationAttributes,
    pub resource_attributes: AuthorizationAttributes,

    pub relations: AuthorizationRelations,
    pub environment: Environment,
}

impl<'a> AuthorizationContext<'a> {
    pub fn from_usecase<U: UseCaseDescriptor>(
        subject: &'a SubjectContext,
        subject_attributes: AuthorizationAttributes,
        resource_attributes: AuthorizationAttributes,
        relations: AuthorizationRelations,
        environment: Environment,
    ) -> Self {
        Self {
            subject,
            action: AuthorizationAction::new(U::ACTION),
            resource_type: AuthorizationResourceType::new(U::RESOURCE),
            subject_attributes,
            resource_attributes,
            relations,
            environment,
        }
    }
}

pub struct AuthorizationEngine {
    guard_policies: Vec<ApplicationStoredPolicy>,
    /// DB-backed ABAC policies — evaluated after guard/dynamic pre-checks, before RBAC fallback.
    stored_policies: Vec<ApplicationStoredPolicy>,
    dynamic_policies: Vec<Box<dyn ApplicationAuthorizationPolicy>>,
    rbac_fallback: bool,
}

impl AuthorizationEngine {
    pub fn new() -> Self {
        Self {
            dynamic_policies: Vec::new(),
            guard_policies: Vec::new(),
            stored_policies: Vec::new(),
            rbac_fallback: false,
        }
    }

    /// Production-style engine: tenant isolation guard + SubjectContext RBAC bridge.
    pub fn with_defaults() -> Self {
        let mut engine = Self::new();
        engine.register_policy(TenantIsolationPolicy);
        engine.rbac_fallback = true;
        engine
    }

    /// Replace all stored ABAC policies (runtime reload — Task 15 M4).
    pub fn replace_stored_policies(
        &mut self,
        policies: impl IntoIterator<Item = ApplicationStoredPolicy>,
    ) {
        self.stored_policies = policies.into_iter().collect();
        self.stored_policies
            .sort_by_key(|p| std::cmp::Reverse(p.priority.id()));
    }

    /// Register DB-backed stored policies (editable ABAC layer).
    pub fn register_stored_policies(
        &mut self,
        policies: impl IntoIterator<Item = ApplicationStoredPolicy>,
    ) {
        self.stored_policies.extend(policies);
        self.stored_policies
            .sort_by_key(|p| std::cmp::Reverse(p.priority.id()));
    }

    /// Build engine with compiled guard policies plus tenant-scoped stored policies.
    pub fn with_stored_policies(policies: Vec<ApplicationStoredPolicy>) -> Self {
        let mut engine = Self::with_defaults();
        engine.register_stored_policies(policies);
        engine
    }

    pub fn register_policy<P>(&mut self, policy: P)
    where
        P: ApplicationAuthorizationPolicy + 'static,
    {
        self.dynamic_policies.push(Box::new(policy));
    }

    pub fn evaluate(&self, ctx: &AuthorizationContext) -> AccessDecision {
        // 1. Guard policies (hard security rules)
        for policy in &self.guard_policies {
            if let Some(decision) = policy.evaluate(ctx) {
                return decision;
            }
        }

        // 2. Dynamic policies (e.g. tenant isolation, test AllowAll)
        for policy in &self.dynamic_policies {
            if let Some(decision) = policy.evaluate(ctx) {
                return decision;
            }
        }

        // 3. Stored ABAC policies (higher priority first)
        for policy in &self.stored_policies {
            if let Some(decision) = policy.evaluate(ctx) {
                return decision;
            }
        }

        // 4. RBAC bridge fallback (Express role permissions)
        if self.rbac_fallback
            && let Some(decision) = RbacPermissionPolicy.evaluate(ctx)
        {
            return decision;
        }

        // 5. Secure default
        AccessDecision::Deny
    }

    pub fn authorize<U: UseCaseDescriptor>(
        &self,
        subject: &SubjectContext,
        subject_attributes: AuthorizationAttributes,
        resource_attributes: AuthorizationAttributes,
        relations: AuthorizationRelations,
        environment: Environment,
    ) -> AccessDecision {
        let ctx = AuthorizationContext::from_usecase::<U>(
            subject,
            subject_attributes,
            resource_attributes,
            relations,
            environment,
        );

        self.evaluate(&ctx)
    }
}

impl Default for AuthorizationEngine {
    fn default() -> Self {
        Self::new()
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
        DateTime, TenantId, UserId,
    };

    use super::*;
    use crate::{
        authorization::{
            action::AuthorizationAction,
            attributes::{AttributeKey, AttributeValue, AuthorizationAttributes},
            policys::{
                ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
                ApplicationStoredPolicy,
            },
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

    fn allow_user_read_policy() -> ApplicationStoredPolicy {
        let mut builder = ApplicationStoredPolicy::new(
            ApplicationPolicyId::new("allow-user-read"),
            ApplicationPolicyPriority::new(100),
        );
        builder
            .set_resource_type(AuthorizationResourceType::new("user"))
            .set_action(AuthorizationAction::new("read"))
            .set_effect(ApplicationPolicyEffect::Allow);
        builder.build().unwrap()
    }

    #[test]
    fn stored_policy_can_allow_when_rbac_would_deny() {
        let subject = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[],
            &[],
        );
        let mut engine = AuthorizationEngine::with_defaults();
        engine.register_stored_policies([allow_user_read_policy()]);
        let decision = engine.evaluate(&auth_ctx(&subject));
        assert!(matches!(decision, AccessDecision::Allow));
    }

    #[test]
    fn stored_deny_policy_runs_before_rbac_allow() {
        let subject = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[],
            &[],
        );
        let mut deny_builder = ApplicationStoredPolicy::new(
            ApplicationPolicyId::new("deny-user-read"),
            ApplicationPolicyPriority::new(100),
        );
        deny_builder
            .set_resource_type(AuthorizationResourceType::new("user"))
            .set_action(AuthorizationAction::new("read"))
            .set_effect(ApplicationPolicyEffect::Deny);
        let deny = deny_builder.build().unwrap();
        let mut engine = AuthorizationEngine::with_defaults();
        engine.register_stored_policies([deny]);
        let decision = engine.evaluate(&auth_ctx(&subject));
        assert!(matches!(decision, AccessDecision::Deny));
    }

    #[test]
    fn stored_policy_with_unmatched_attributes_defers_to_rbac() {
        use domain::{Action, Description, Name, Permission, PermissionId, Resource, Role, RoleId};

        fn read_role() -> Role {
            let mut builder = Role::new(RoleId::new("viewer"));
            builder
                .set_name(Name::new("Viewer").unwrap())
                .set_description(Description::new("Viewer").unwrap())
                .add_permission(Permission::new(
                    PermissionId::new("p1"),
                    Resource::new("admin_users").unwrap(),
                    Action::new("read").unwrap(),
                    Description::new("perm").unwrap(),
                    DateTime::new(0),
                    1,
                ))
                .set_is_system_role(true)
                .set_created_at(DateTime::new(0));
            builder.build().unwrap()
        }

        let subject = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[read_role()],
            &[],
        );
        let mut attrs = AuthorizationAttributes::new();
        attrs.add_attribute((
            AttributeKey::new("tier"),
            AttributeValue::String("pro".into()),
        ));
        let mut policy_builder = ApplicationStoredPolicy::new(
            ApplicationPolicyId::new("tier-gate"),
            ApplicationPolicyPriority::new(50),
        );
        policy_builder
            .set_resource_type(AuthorizationResourceType::new("user"))
            .set_action(AuthorizationAction::new("read"))
            .add_required_resource_attribute((
                AttributeKey::new("tier"),
                AttributeValue::String("enterprise".into()),
            ))
            .set_effect(ApplicationPolicyEffect::Allow);
        let policy = policy_builder.build().unwrap();

        let mut engine = AuthorizationEngine::with_defaults();
        engine.register_stored_policies([policy]);
        let mut ctx = auth_ctx(&subject);
        ctx.resource_attributes = attrs;
        let decision = engine.evaluate(&ctx);
        assert!(matches!(decision, AccessDecision::Allow));
    }
}
