use std::collections::HashSet;
use std::hash::Hash;

use domain::tenant::environment::Environment;
use domain::traits::field::Field;
use domain::TenantId;
use domain::UserId;

use crate::{
    error::{AppError, AppResult},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

use super::{
    access_descriptor::AccessControl,
    attributes::{AttributeKey, AttributeValue, AuthorizationAttributes},
    engine::AuthorizationContext,
    field_access::FieldAccessResolver,
    ports::AuthorizationService,
    relation::AuthorizationRelations,
    AccessDecision,
};

/// Inputs for action-level authorization before a use case touches repositories.
#[derive(Debug, Clone)]
pub struct AuthorizationParams<'a> {
    pub subject: &'a SubjectContext,
    pub environment: Environment,
    pub subject_attributes: AuthorizationAttributes,
    pub resource_attributes: AuthorizationAttributes,
    pub relations: AuthorizationRelations,
    /// Target entity user id for self-read field policy (M3).
    pub target_user_id: Option<UserId>,
}

impl<'a> AuthorizationParams<'a> {
    pub fn new(subject: &'a SubjectContext, environment: Environment) -> Self {
        Self {
            subject,
            environment,
            subject_attributes: AuthorizationAttributes::new(),
            resource_attributes: AuthorizationAttributes::new(),
            relations: AuthorizationRelations::new(),
            target_user_id: None,
        }
    }

    pub fn with_resource_attributes(mut self, attributes: AuthorizationAttributes) -> Self {
        self.resource_attributes = attributes;
        self
    }

    /// Sets `tenant_id` on resource attributes for [`TenantIsolationPolicy`](super::guard::tenant::TenantIsolationPolicy).
    pub fn with_resource_tenant_id(mut self, tenant_id: &TenantId) -> Self {
        self.resource_attributes.add_attribute((
            AttributeKey::new("tenant_id"),
            AttributeValue::String(tenant_id.as_str().to_string()),
        ));
        self
    }

    /// Sets target user for self-read field visibility in user read use cases.
    pub fn with_target_user_id(mut self, user_id: &UserId) -> Self {
        self.target_user_id = Some(user_id.clone());
        self
    }
}

/// Phase 1 action authorization — returns `Forbidden` when the engine denies.
pub fn authorize_use_case<U: UseCaseDescriptor>(
    auth: &dyn AuthorizationService,
    params: &AuthorizationParams<'_>,
) -> AppResult<AccessDecision> {
    let ctx = AuthorizationContext::from_usecase::<U>(
        params.subject,
        params.subject_attributes.clone(),
        params.resource_attributes.clone(),
        params.relations.clone(),
        params.environment.clone(),
    );

    match auth.authorize(&ctx) {
        AccessDecision::Allow => Ok(AccessDecision::Allow),
        AccessDecision::Deny => Err(AppError::Forbidden),
    }
}

/// Phase 1 + 2 — action allow/deny then field access aligned with the use-case descriptor.
///
/// `resolve_readable` receives the same `RESOURCE`/`ACTION` strings used for phase-1 auth.
pub fn authorize_use_case_with_fields<U, F>(
    auth: &dyn AuthorizationService,
    params: &AuthorizationParams<'_>,
    resolve_readable: fn(
        &SubjectContext,
        &Environment,
        &'static str,
        &'static str,
        Option<&UserId>,
    ) -> HashSet<F>,
) -> AppResult<AccessControl<F>>
where
    U: UseCaseDescriptor,
    F: Field + Eq + Hash + Copy,
{
    let decision = authorize_use_case::<U>(auth, params)?;
    let readable = resolve_readable(
        params.subject,
        &params.environment,
        U::RESOURCE,
        U::ACTION,
        params.target_user_id.as_ref(),
    );
    FieldAccessResolver::resolve(decision, readable)
}

/// Neutral environment for tests and use cases until HTTP extractors supply real context (Task 12).
pub fn neutral_environment() -> Environment {
    use domain::tenant::environment::{
        datetime::EnvironmentTime,
        device_security_posture::DeviceSecurityPosture,
        location::{EnvironmentLocation, LocationZone},
        network_information::{ConnectionType, NetworkInformation},
        risk_signals::{AuthenticationStrength, RiskSignals},
    };
    use domain::DateTime;

    Environment::new(
        EnvironmentTime::new(DateTime::new(0), true),
        EnvironmentLocation::new(LocationZone::Unknown),
        DeviceSecurityPosture::new(true, true, true),
        NetworkInformation::new(false, true, ConnectionType::CorporateNetwork),
        RiskSignals::new(0, AuthenticationStrength::MultiFactor, 0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authorization::engine::AuthorizationEngine;
    use crate::projection::fields::user::UserField;
    use crate::usecases::field_sets::readable_user_fields;
    use crate::usecases::user::update::UpdateUserUseCase;

    struct AlwaysAllow;

    impl AuthorizationService for AlwaysAllow {
        fn authorize(&self, _ctx: &AuthorizationContext) -> AccessDecision {
            AccessDecision::Allow
        }
    }

    #[test]
    fn authorize_use_case_returns_allow_when_service_allows() {
        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[],
            &[],
        );
        let params = AuthorizationParams::new(&subject, neutral_environment());
        let decision =
            authorize_use_case::<UpdateUserUseCase>(&AlwaysAllow, &params).expect("allow");
        assert!(matches!(decision, AccessDecision::Allow));
    }

    #[test]
    fn authorize_use_case_returns_forbidden_when_engine_denies_by_default() {
        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[],
            &[],
        );
        let params = AuthorizationParams::new(&subject, neutral_environment());
        let engine = AuthorizationEngine::new();
        let err = authorize_use_case::<UpdateUserUseCase>(&engine, &params).unwrap_err();
        assert!(matches!(err, AppError::Forbidden));
    }

    #[test]
    fn tenant_isolation_denies_cross_tenant_resource() {
        use domain::{Description, Name, Permission, PermissionId, Role, RoleId, TenantId};

        fn role_with_read() -> Role {
            let mut builder = Role::new(RoleId::new("admin"));
            builder
                .set_name(Name::new("Admin").unwrap())
                .set_description(Description::new("Admin").unwrap())
                .add_permission(Permission::new(
                    PermissionId::new("p1"),
                    domain::Resource::new("admin_users").unwrap(),
                    domain::Action::new("read").unwrap(),
                    Description::new("perm").unwrap(),
                    domain::DateTime::new(0),
                    1,
                ))
                .set_is_system_role(true)
                .set_created_at(domain::DateTime::new(0));
            builder.build().unwrap()
        }

        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            TenantId::new("tenant-a"),
            &[role_with_read()],
            &[],
        );
        let params = AuthorizationParams::new(&subject, neutral_environment())
            .with_resource_tenant_id(&TenantId::new("tenant-b"));
        let engine = AuthorizationEngine::with_defaults();
        let err =
            authorize_use_case::<crate::usecases::user::read::get_by::id::GetUserByIdUseCase>(
                &engine, &params,
            )
            .unwrap_err();
        assert!(matches!(err, AppError::Forbidden));
    }

    #[test]
    fn update_user_fields_include_detail_when_subject_has_manage_only() {
        use domain::{Description, Name, Permission, PermissionId, Role, RoleId};

        fn manage_only_role() -> Role {
            let mut builder = Role::new(RoleId::new("admin"));
            builder
                .set_name(Name::new("Admin").unwrap())
                .set_description(Description::new("Admin").unwrap())
                .add_permission(Permission::new(
                    PermissionId::new("p1"),
                    domain::Resource::new("admin_users").unwrap(),
                    domain::Action::new("manage").unwrap(),
                    Description::new("perm").unwrap(),
                    domain::DateTime::new(0),
                    1,
                ))
                .set_is_system_role(true)
                .set_created_at(domain::DateTime::new(0));
            builder.build().unwrap()
        }

        let subject = SubjectContext::new(
            domain::UserId::new("u1"),
            domain::TenantId::new("t1"),
            &[manage_only_role()],
            &[],
        );
        let params = AuthorizationParams::new(&subject, neutral_environment());
        let engine = AuthorizationEngine::with_defaults();
        let access = authorize_use_case_with_fields::<UpdateUserUseCase, UserField>(
            &engine,
            &params,
            readable_user_fields,
        )
        .expect("manage allows update");
        assert!(access.readable_fields.contains(&UserField::Version));
        assert!(access.readable_fields.contains(&UserField::FailedLogins));
    }
}
